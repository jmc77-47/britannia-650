import {
  MAX_TRACK_LEVEL,
  addResourceDelta,
  createZeroResources,
  getCountyDefenseFromBuildingLevels,
  type BuildingType,
} from './buildings'
import { getPlayerTurnYieldSummary } from './economy'
import { validateOrders } from './orders'
import {
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
  const nextBuildQueueByCountyId: Record<string, CountyBuildQueueState> = {}

  Object.entries(state.buildQueueByCountyId).forEach(([countyId, queueState]) => {
    const countyState = nextCounties[countyId]
    if (!countyState) {
      return
    }

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
        if (activeOrder.trackType === 'ROADS') {
          const nextRoadLevel = clampTrackLevel(
            countyState.roadLevel + activeOrder.targetLevelDelta,
          )
          nextCounties[countyId] = {
            ...countyState,
            roadLevel: nextRoadLevel,
          }
        } else {
          const buildingType = activeOrder.trackType as BuildingType
          const nextBuildingLevels = {
            ...countyState.buildings,
            [buildingType]: clampTrackLevel(
              (countyState.buildings[buildingType] ?? 0) + activeOrder.targetLevelDelta,
            ),
          }

          nextCounties[countyId] = {
            ...countyState,
            buildings: nextBuildingLevels,
            defense: getCountyDefenseFromBuildingLevels(nextBuildingLevels),
          }
        }

        activeOrder = queuedOrders.shift() ?? null
      }
    }

    if (activeOrder || queuedOrders.length > 0) {
      nextBuildQueueByCountyId[countyId] = {
        activeOrder,
        queuedOrders,
      }
    }
  })

  state.ownedCountyIds.forEach((countyId) => {
    const countyState = nextCounties[countyId]
    if (!countyState || countyState.roadLevel >= 1) {
      return
    }

    nextCounties[countyId] = {
      ...countyState,
      roadLevel: 1,
    }
  })

  const playerFactionId = state.playerFactionId
  const basePlayerResources = playerFactionId
    ? (state.resourcesByKingdomId[playerFactionId] ?? createZeroResources())
    : createZeroResources()

  const postBuildState = {
    ...state,
    counties: nextCounties,
  }
  const turnYieldSummary = getPlayerTurnYieldSummary(postBuildState)
  const nextPlayerResources = addResourceDelta(
    basePlayerResources,
    turnYieldSummary.totalDelta,
  )

  const nextResourcesByKingdomId = { ...state.resourcesByKingdomId }
  if (playerFactionId) {
    nextResourcesByKingdomId[playerFactionId] = nextPlayerResources
  }

  const nextTurnNumber = state.turnNumber + 1

  return {
    ...state,
    counties: nextCounties,
    resourcesByKingdomId: nextResourcesByKingdomId,
    turnNumber: nextTurnNumber,
    buildQueueByCountyId: nextBuildQueueByCountyId,
    lastTurnReport: {
      turnNumber: nextTurnNumber,
      resourceDeltas: turnYieldSummary.totalDelta,
      topContributions: turnYieldSummary.contributionLines.slice(0, 5),
    },
    pendingOrders: [],
  }
}
