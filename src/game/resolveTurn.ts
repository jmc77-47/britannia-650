import {
  MAX_TRACK_LEVEL,
  addResourceDelta,
  createEmptyBuildingLevels,
  createZeroResources,
  getCountyDefenseFromBuildingLevels,
  getPopulationCapForFarmLevel,
  isBuildingTrack,
} from './buildings'
import {
  applyConquestDamageToBuildings,
  getPostConquestPopulation,
  getPostConquestRoadLevel,
} from './countyActions'
import {
  clampResourcesToStorageCaps,
  getPlayerTurnYieldSummary,
  getResourceDeltaBetweenStockpiles,
} from './economy'
import { validateOrders } from './orders'
import {
  createEmptyCountyBuildQueue,
  normalizeCountyId,
  type CountyBuildQueueState,
  type GameState,
} from './state'

const clampTrackLevel = (level: number): number =>
  Math.max(0, Math.min(MAX_TRACK_LEVEL, Math.floor(level)))

export const resolveTurn = (state: GameState): GameState => {
  const validationResults = validateOrders(state.pendingOrders, state)
  const invalidOrderCount = validationResults.filter(
    (result) => !result.isValid,
  ).length

  if (import.meta.env.DEV && invalidOrderCount > 0) {
    console.warn(
      `[TurnResolver] Ignoring ${invalidOrderCount} invalid order(s) this turn.`,
      validationResults,
    )
  }

  const nextCounties: GameState['counties'] = { ...state.counties }
  const nextOwnedCountyIds = new Set(state.ownedCountyIds.map((countyId) => normalizeCountyId(countyId)))
  const nextDiscoveredCountyIds = new Set(
    state.discoveredCountyIds.map((countyId) => normalizeCountyId(countyId)),
  )
  const countyActionCompletionLines: string[] = []
  const nextBuildQueueByCountyId: Record<string, CountyBuildQueueState> = {}

  Object.entries(state.buildQueueByCountyId).forEach(([countyId, queueState]) => {
    const countyState = nextCounties[countyId]
    if (!countyState) {
      return
    }

    let workingCountyState = countyState
    let activeOrder = queueState.activeOrder
      ? {
          ...queueState.activeOrder,
        }
      : null
    const queuedOrders = [...queueState.queuedOrders]

    if (!activeOrder && queuedOrders.length > 0) {
      activeOrder = queuedOrders.shift() ?? null
    }

    if (activeOrder) {
      activeOrder.turnsRemaining = Math.max(0, activeOrder.turnsRemaining - 1)

      if (activeOrder.turnsRemaining === 0) {
        if (activeOrder.kind === 'UPGRADE_TRACK') {
          if (activeOrder.trackType === 'ROADS') {
            const nextRoadLevel = clampTrackLevel(
              workingCountyState.roadLevel + activeOrder.targetLevelDelta,
            )
            workingCountyState = {
              ...workingCountyState,
              roadLevel: nextRoadLevel,
            }
          } else if (isBuildingTrack(activeOrder.trackType)) {
            const nextBuildingLevels = {
              ...workingCountyState.buildings,
              [activeOrder.trackType]: clampTrackLevel(
                (workingCountyState.buildings[activeOrder.trackType] ?? 0) +
                  activeOrder.targetLevelDelta,
              ),
            }

            workingCountyState = {
              ...workingCountyState,
              buildings: nextBuildingLevels,
              defense: getCountyDefenseFromBuildingLevels(nextBuildingLevels),
            }
          }

          activeOrder = queuedOrders.shift() ?? null
        } else if (activeOrder.kind === 'CLAIM_COUNTY') {
          const playerFactionId = state.playerFactionId
          if (playerFactionId) {
            const buildingLevels = createEmptyBuildingLevels()
            buildingLevels.FARM = 1
            const populationCap = getPopulationCapForFarmLevel(buildingLevels.FARM)

            workingCountyState = {
              ...workingCountyState,
              ownerId: playerFactionId,
              buildings: buildingLevels,
              roadLevel: 1,
              population: Math.min(30, populationCap),
              defense: getCountyDefenseFromBuildingLevels(buildingLevels),
            }

            nextOwnedCountyIds.add(countyId)
            nextDiscoveredCountyIds.add(countyId)
            countyActionCompletionLines.push(`Claimed ${workingCountyState.name} (${countyId})`)
          }

          activeOrder = null
          queuedOrders.length = 0
        } else if (activeOrder.kind === 'CONQUER_COUNTY') {
          const playerFactionId = state.playerFactionId
          if (playerFactionId) {
            const nextBuildingLevels = applyConquestDamageToBuildings(
              workingCountyState.buildings,
            )
            const populationCap = getPopulationCapForFarmLevel(nextBuildingLevels.FARM)

            workingCountyState = {
              ...workingCountyState,
              ownerId: playerFactionId,
              buildings: nextBuildingLevels,
              roadLevel: getPostConquestRoadLevel(workingCountyState.roadLevel),
              population: Math.min(
                getPostConquestPopulation(workingCountyState.population),
                populationCap,
              ),
              defense: getCountyDefenseFromBuildingLevels(nextBuildingLevels),
            }

            nextOwnedCountyIds.add(countyId)
            nextDiscoveredCountyIds.add(countyId)
            countyActionCompletionLines.push(
              `Conquered ${workingCountyState.name} (${countyId})`,
            )
          }

          activeOrder = null
          queuedOrders.length = 0
        }
      }
    }

    nextCounties[countyId] = workingCountyState

    if (activeOrder || queuedOrders.length > 0) {
      nextBuildQueueByCountyId[countyId] = {
        activeOrder,
        queuedOrders,
      }
    }
  })

  let nextWarehouseLevel = state.warehouseLevel
  let globalActiveOrder = state.globalBuildQueue.activeOrder
    ? {
        ...state.globalBuildQueue.activeOrder,
      }
    : null
  const globalQueuedOrders = [...state.globalBuildQueue.queuedOrders]

  if (!globalActiveOrder && globalQueuedOrders.length > 0) {
    globalActiveOrder = globalQueuedOrders.shift() ?? null
  }

  if (globalActiveOrder) {
    globalActiveOrder.turnsRemaining = Math.max(0, globalActiveOrder.turnsRemaining - 1)

    if (globalActiveOrder.turnsRemaining === 0) {
      if (globalActiveOrder.trackType === 'WAREHOUSE') {
        nextWarehouseLevel = Math.min(MAX_TRACK_LEVEL, nextWarehouseLevel + 1)
      }

      globalActiveOrder = globalQueuedOrders.shift() ?? null
    }
  }

  const nextGlobalBuildQueue: CountyBuildQueueState =
    globalActiveOrder || globalQueuedOrders.length > 0
      ? {
          activeOrder: globalActiveOrder,
          queuedOrders: globalQueuedOrders,
        }
      : createEmptyCountyBuildQueue()

  const nextOwnedCountyIdList = [...nextOwnedCountyIds]
  nextOwnedCountyIdList.forEach((countyId) => {
    const countyState = nextCounties[countyId]
    if (!countyState || countyState.roadLevel >= 1) {
      return
    }

    nextCounties[countyId] = {
      ...countyState,
      roadLevel: 1,
    }
  })

  const postBuildState: GameState = {
    ...state,
    ownedCountyIds: nextOwnedCountyIdList,
    discoveredCountyIds: [...nextDiscoveredCountyIds],
    counties: nextCounties,
    buildQueueByCountyId: nextBuildQueueByCountyId,
    globalBuildQueue: nextGlobalBuildQueue,
    warehouseLevel: nextWarehouseLevel,
  }

  const turnYieldSummary = getPlayerTurnYieldSummary(postBuildState)

  Object.entries(turnYieldSummary.countyPopulationDeltas).forEach(
    ([countyId, populationDelta]) => {
      if (populationDelta <= 0) {
        return
      }

      const countyState = nextCounties[countyId]
      if (!countyState) {
        return
      }

      nextCounties[countyId] = {
        ...countyState,
        population: countyState.population + populationDelta,
      }
    },
  )

  const playerFactionId = state.playerFactionId
  const basePlayerResources = playerFactionId
    ? (state.resourcesByKingdomId[playerFactionId] ?? createZeroResources())
    : createZeroResources()

  let nextPlayerResources = addResourceDelta(
    basePlayerResources,
    turnYieldSummary.totalDelta,
  )

  const storageClampResult = clampResourcesToStorageCaps(
    nextPlayerResources,
    nextWarehouseLevel,
  )
  nextPlayerResources = storageClampResult.resources

  const populationCapLines: string[] = []
  nextOwnedCountyIdList.forEach((countyId) => {
    const countyState = nextCounties[countyId]
    if (!countyState) {
      return
    }

    const populationCap = getPopulationCapForFarmLevel(countyState.buildings.FARM)
    const clampedPopulation = Math.min(
      Math.max(0, Math.floor(countyState.population)),
      populationCap,
    )
    if (clampedPopulation !== countyState.population) {
      populationCapLines.push(
        `${countyState.name} (${countyId}): Population cap reached (-${countyState.population - clampedPopulation})`,
      )
    }

    nextCounties[countyId] = {
      ...countyState,
      population: clampedPopulation,
    }
  })

  const totalOwnedPopulation = nextOwnedCountyIdList.reduce((total, countyId) => {
    return total + (nextCounties[countyId]?.population ?? 0)
  }, 0)
  nextPlayerResources = {
    ...nextPlayerResources,
    population: totalOwnedPopulation,
  }

  const nextResourcesByKingdomId = { ...state.resourcesByKingdomId }
  if (playerFactionId) {
    nextResourcesByKingdomId[playerFactionId] = nextPlayerResources
  }

  const nextTurnNumber = state.turnNumber + 1

  return {
    ...state,
    counties: nextCounties,
    resourcesByKingdomId: nextResourcesByKingdomId,
    ownedCountyIds: nextOwnedCountyIdList,
    discoveredCountyIds: [...nextDiscoveredCountyIds],
    turnNumber: nextTurnNumber,
    buildQueueByCountyId: nextBuildQueueByCountyId,
    globalBuildQueue: nextGlobalBuildQueue,
    warehouseLevel: nextWarehouseLevel,
    lastTurnReport: {
      turnNumber: nextTurnNumber,
      resourceDeltas: getResourceDeltaBetweenStockpiles(
        basePlayerResources,
        nextPlayerResources,
      ),
      topContributions: [
        ...countyActionCompletionLines,
        ...storageClampResult.wasteLines,
        ...populationCapLines,
        ...turnYieldSummary.contributionLines,
      ].slice(0, 8),
    },
    pendingOrders: [],
  }
}
