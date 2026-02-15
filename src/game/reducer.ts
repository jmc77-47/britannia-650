import {
  MAX_TRACK_LEVEL,
  MAX_WAREHOUSE_LEVEL,
  addResourceDelta,
  costFitsStorageCaps,
  createEmptyBuildingLevels,
  doesBuildingTrackConsumeSlot,
  getStorageCapsForWarehouseLevel,
  getTrackUpgradeCost,
  getTrackUpgradeTurns,
  hasEnoughResources,
  isBuildingTrack,
  subtractResourceDelta,
  type BuildingLevels,
  type UpgradeTrackType,
} from './buildings'
import {
  CLAIM_COUNTY_COST,
  CLAIM_COUNTY_POPULATION_COST,
  CONQUER_COUNTY_COST,
  CONQUER_COUNTY_POPULATION_COST,
  NEUTRAL_OWNER_ID,
  getClaimCountyTurns,
  getConquerCountyTurns,
} from './countyActions'
import {
  getCountyBuildSlotsCapForBuildingLevels,
  getCountyBuildSlotsUsedForBuildingLevels,
  getCountyPopulationUsedForBuildingLevels,
} from './economy'
import { resolveTurn } from './resolveTurn'
import {
  createEmptyCountyBuildQueue,
  createStartingResources,
  normalizeCountyId,
  type CountyBuildOrder,
  type CountyBuildQueueState,
  type GameState,
} from './state'

export type GameAction =
  | {
      type: 'SELECT_COUNTY'
      countyId: string | null
    }
  | {
      type: 'END_TURN'
    }
  | {
      type: 'BEGIN_GAME_WITH_CHARACTER'
      characterId: string
      discoveredCountyIds?: string[]
    }
  | {
      type: 'OPEN_SETUP'
    }
  | {
      type: 'TOGGLE_FOG_OF_WAR'
    }
  | {
      type: 'TOGGLE_SUPERHIGHWAYS'
    }
  | {
      type: 'TOGGLE_NO_CONQUEST'
    }
  | {
      type: 'QUEUE_TRACK_UPGRADE'
      countyId: string
      trackType: UpgradeTrackType
    }
  | {
      type: 'QUEUE_CLAIM_COUNTY'
      targetCountyId: string
      sourceCountyId: string
    }
  | {
      type: 'QUEUE_CONQUER_COUNTY'
      targetCountyId: string
      sourceCountyId: string
    }
  | {
      type: 'QUEUE_WAREHOUSE_UPGRADE'
    }
  | {
      type: 'REMOVE_QUEUED_BUILD_ORDER'
      countyId: string
      queueIndex: number
    }
  | {
      type: 'REMOVE_QUEUED_WAREHOUSE_ORDER'
      queueIndex: number
    }
  | {
      type: 'CLOSE_TURN_REPORT'
    }

const normalizeCountyIdList = (countyIds: string[]): string[] => {
  const uniqueCountyIds = new Set<string>()
  countyIds.forEach((countyId) => {
    const normalizedCountyId = normalizeCountyId(countyId)
    if (normalizedCountyId) {
      uniqueCountyIds.add(normalizedCountyId)
    }
  })

  return [...uniqueCountyIds]
}

const getTrackLevelInCounty = (
  countyId: string,
  trackType: UpgradeTrackType,
  state: GameState,
): number => {
  const county = state.counties[countyId]
  if (!county) {
    return 0
  }

  if (trackType === 'ROADS') {
    return county.roadLevel
  }

  if (trackType === 'WAREHOUSE') {
    return 0
  }

  return county.buildings[trackType] ?? 0
}

const getQueuedTrackIncrements = (
  queueState: CountyBuildQueueState,
  trackType: UpgradeTrackType,
): number => {
  let pendingIncrements = 0

  if (
    queueState.activeOrder &&
    queueState.activeOrder.kind === 'UPGRADE_TRACK' &&
    queueState.activeOrder.trackType === trackType
  ) {
    pendingIncrements += queueState.activeOrder.targetLevelDelta
  }

  queueState.queuedOrders.forEach((order) => {
    if (order.kind === 'UPGRADE_TRACK' && order.trackType === trackType) {
      pendingIncrements += order.targetLevelDelta
    }
  })

  return pendingIncrements
}

const getQueuedBuildingLevelIncrements = (
  queueState: CountyBuildQueueState,
): Record<string, number> => {
  const increments: Record<string, number> = {}
  const allOrders = [queueState.activeOrder, ...queueState.queuedOrders].filter(
    (order): order is CountyBuildOrder => !!order,
  )

  allOrders.forEach((order) => {
    if (order.kind !== 'UPGRADE_TRACK' || !isBuildingTrack(order.trackType)) {
      return
    }

    increments[order.trackType] =
      (increments[order.trackType] ?? 0) + order.targetLevelDelta
  })

  return increments
}

const getProjectedBuildingLevelsForQueue = (
  countyId: string,
  state: GameState,
  queueState: CountyBuildQueueState,
): BuildingLevels => {
  const countyState = state.counties[countyId]
  if (!countyState) {
    return createEmptyBuildingLevels()
  }

  const projectedLevels: BuildingLevels = { ...countyState.buildings }
  const queuedIncrements = getQueuedBuildingLevelIncrements(queueState)

  Object.entries(queuedIncrements).forEach(([buildingType, increment]) => {
    projectedLevels[buildingType] = Math.max(
      0,
      (projectedLevels[buildingType] ?? 0) + increment,
    )
  })

  return projectedLevels
}

const getUsedOrderIds = (queueState: CountyBuildQueueState): Set<string> => {
  const ids = new Set<string>()
  if (queueState.activeOrder) {
    ids.add(queueState.activeOrder.id)
  }
  queueState.queuedOrders.forEach((order) => ids.add(order.id))
  return ids
}

const createBuildOrderId = (
  queueOwnerId: string,
  orderType: string,
  turnNumber: number,
  queueState: CountyBuildQueueState,
): string => {
  const usedIds = getUsedOrderIds(queueState)
  let sequence = usedIds.size + 1
  let candidate = `${queueOwnerId}-${orderType}-${turnNumber}-${sequence}`

  while (usedIds.has(candidate)) {
    sequence += 1
    candidate = `${queueOwnerId}-${orderType}-${turnNumber}-${sequence}`
  }

  return candidate
}

const hasAnyCountyOrder = (queueState: CountyBuildQueueState): boolean =>
  !!queueState.activeOrder || queueState.queuedOrders.length > 0

const getOwnedCountyPopulationTotal = (
  countyIds: string[],
  counties: GameState['counties'],
): number =>
  countyIds.reduce((total, countyId) => {
    const countyPopulation = counties[countyId]?.population ?? 0
    return total + Math.max(0, Math.floor(countyPopulation))
  }, 0)

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === 'OPEN_SETUP') {
    return {
      ...state,
      gamePhase: 'setup',
      turnNumber: 1,
      selectedCountyId: null,
      selectedCharacterId: null,
      startingCountyId: null,
      playerFactionId: null,
      playerFactionName: null,
      playerFactionColor: null,
      ownedCountyIds: [],
      buildQueueByCountyId: {},
      globalBuildQueue: createEmptyCountyBuildQueue(),
      warehouseLevel: 1,
      lastTurnReport: null,
      fogOfWarEnabled: true,
      superhighwaysEnabled: state.superhighwaysEnabled,
      noConquestEnabled: state.noConquestEnabled,
      discoveredCountyIds: [],
      pendingOrders: [],
    }
  }

  if (action.type === 'BEGIN_GAME_WITH_CHARACTER') {
    const selectedCharacter = state.availableCharacters.find(
      (character) => character.id === action.characterId,
    )
    if (!selectedCharacter) {
      return state
    }

    const startingCountyId = normalizeCountyId(selectedCharacter.startCountyId)
    const kingdom = state.kingdoms.find((candidateKingdom) =>
      candidateKingdom.countyIds.includes(startingCountyId),
    )
    const playerFactionId = kingdom?.id ?? `player-${selectedCharacter.id}`
    const ownedCountyIds = kingdom
      ? kingdom.countyIds
      : startingCountyId
        ? [startingCountyId]
        : []

    const countiesWithOwnedRoadMinimum = { ...state.counties }
    ownedCountyIds.forEach((countyId) => {
      const countyState = state.counties[countyId]
      if (!countyState) {
        return
      }

      countiesWithOwnedRoadMinimum[countyId] = {
        ...countyState,
        ownerId: playerFactionId,
        roadLevel: countyState.roadLevel >= 1 ? countyState.roadLevel : 1,
      }
    })

    const baseResources = createStartingResources()
    const resourcesByKingdomId = {
      ...state.resourcesByKingdomId,
      [playerFactionId]: {
        ...baseResources,
        population: getOwnedCountyPopulationTotal(
          ownedCountyIds,
          countiesWithOwnedRoadMinimum,
        ),
      },
    }
    const discoveredCountyIds = normalizeCountyIdList(
      action.discoveredCountyIds ?? [startingCountyId],
    )
    if (startingCountyId && !discoveredCountyIds.includes(startingCountyId)) {
      discoveredCountyIds.push(startingCountyId)
    }

    return {
      ...state,
      gamePhase: 'playing',
      turnNumber: 1,
      selectedCharacterId: selectedCharacter.id,
      startingCountyId: startingCountyId || null,
      selectedCountyId: startingCountyId || null,
      playerFactionId,
      playerFactionName: kingdom?.name ?? `${selectedCharacter.name}'s Realm`,
      playerFactionColor: kingdom?.color ?? '#f3c94b',
      ownedCountyIds,
      counties: countiesWithOwnedRoadMinimum,
      resourcesByKingdomId,
      buildQueueByCountyId: {},
      globalBuildQueue: createEmptyCountyBuildQueue(),
      warehouseLevel: 1,
      lastTurnReport: null,
      fogOfWarEnabled: true,
      superhighwaysEnabled: state.superhighwaysEnabled,
      noConquestEnabled: state.noConquestEnabled,
      discoveredCountyIds,
      pendingOrders: [],
    }
  }

  if (action.type === 'TOGGLE_FOG_OF_WAR') {
    return {
      ...state,
      fogOfWarEnabled: !state.fogOfWarEnabled,
    }
  }

  if (action.type === 'TOGGLE_SUPERHIGHWAYS') {
    return {
      ...state,
      superhighwaysEnabled: !state.superhighwaysEnabled,
    }
  }

  if (action.type === 'TOGGLE_NO_CONQUEST') {
    return {
      ...state,
      noConquestEnabled: !state.noConquestEnabled,
    }
  }

  if (action.type === 'SELECT_COUNTY') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const countyId = normalizeCountyId(action.countyId)
    if (!countyId) {
      return {
        ...state,
        selectedCountyId: null,
      }
    }

    return {
      ...state,
      selectedCountyId: countyId,
    }
  }

  if (action.type === 'END_TURN') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    return resolveTurn(state)
  }

  if (action.type === 'QUEUE_TRACK_UPGRADE') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    if (action.trackType === 'WAREHOUSE') {
      return state
    }

    const countyId = normalizeCountyId(action.countyId)
    if (!countyId || !state.counties[countyId] || !state.ownedCountyIds.includes(countyId)) {
      return state
    }

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    const existingQueueState =
      state.buildQueueByCountyId[countyId] ?? createEmptyCountyBuildQueue()
    const currentTrackLevel = getTrackLevelInCounty(countyId, action.trackType, state)
    const queuedTrackLevels = getQueuedTrackIncrements(existingQueueState, action.trackType)
    const nextLevel = currentTrackLevel + queuedTrackLevels + 1
    if (nextLevel > MAX_TRACK_LEVEL) {
      return state
    }

    const turnsRequired = getTrackUpgradeTurns(action.trackType, nextLevel)
    if (turnsRequired <= 0) {
      return state
    }

    const upgradeCost = getTrackUpgradeCost(action.trackType, nextLevel)
    const storageCaps = getStorageCapsForWarehouseLevel(state.warehouseLevel)
    if (!costFitsStorageCaps(upgradeCost, storageCaps)) {
      return state
    }

    if (!hasEnoughResources(playerResources, upgradeCost)) {
      return state
    }

    const countyState = state.counties[countyId]
    if (isBuildingTrack(action.trackType) && countyState) {
      const projectedLevels = getProjectedBuildingLevelsForQueue(
        countyId,
        state,
        existingQueueState,
      )

      if (
        doesBuildingTrackConsumeSlot(action.trackType) &&
        (projectedLevels[action.trackType] ?? 0) <= 0
      ) {
        const slotsUsed = getCountyBuildSlotsUsedForBuildingLevels(projectedLevels)
        const slotsCap = getCountyBuildSlotsCapForBuildingLevels(projectedLevels)
        if (slotsUsed >= slotsCap) {
          return state
        }
      }

      const projectedLevelsAfterUpgrade = {
        ...projectedLevels,
        [action.trackType]: (projectedLevels[action.trackType] ?? 0) + 1,
      }
      const projectedPopulationUsed = getCountyPopulationUsedForBuildingLevels(
        projectedLevelsAfterUpgrade,
      )
      if (projectedPopulationUsed > countyState.population) {
        return state
      }
    }

    const newOrder: CountyBuildOrder = {
      id: createBuildOrderId(
        countyId,
        action.trackType,
        state.turnNumber,
        existingQueueState,
      ),
      kind: 'UPGRADE_TRACK',
      trackType: action.trackType,
      targetLevelDelta: 1,
      turnsRemaining: turnsRequired,
      cost: upgradeCost,
      queuedOnTurn: state.turnNumber,
    }

    const nextQueueState: CountyBuildQueueState = existingQueueState.activeOrder
      ? {
          ...existingQueueState,
          queuedOrders: [...existingQueueState.queuedOrders, newOrder],
        }
      : {
          ...existingQueueState,
          activeOrder: newOrder,
        }

    return {
      ...state,
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: subtractResourceDelta(playerResources, upgradeCost),
      },
      buildQueueByCountyId: {
        ...state.buildQueueByCountyId,
        [countyId]: nextQueueState,
      },
    }
  }

  if (action.type === 'QUEUE_CLAIM_COUNTY') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    const targetCountyId = normalizeCountyId(action.targetCountyId)
    const sourceCountyId = normalizeCountyId(action.sourceCountyId)
    const targetCountyState = state.counties[targetCountyId]
    const sourceCountyState = state.counties[sourceCountyId]
    if (!targetCountyState || !sourceCountyState) {
      return state
    }

    if (targetCountyState.ownerId !== NEUTRAL_OWNER_ID) {
      return state
    }

    if (sourceCountyState.ownerId !== playerFactionId) {
      return state
    }

    const existingQueueState =
      state.buildQueueByCountyId[targetCountyId] ?? createEmptyCountyBuildQueue()
    if (hasAnyCountyOrder(existingQueueState)) {
      return state
    }

    if (!hasEnoughResources(playerResources, CLAIM_COUNTY_COST)) {
      return state
    }

    if (sourceCountyState.population < CLAIM_COUNTY_POPULATION_COST) {
      return state
    }

    const order: CountyBuildOrder = {
      id: createBuildOrderId(targetCountyId, 'CLAIM', state.turnNumber, existingQueueState),
      kind: 'CLAIM_COUNTY',
      turnsRemaining: getClaimCountyTurns(sourceCountyState.roadLevel),
      cost: CLAIM_COUNTY_COST,
      sourceCountyId,
      populationCost: CLAIM_COUNTY_POPULATION_COST,
      queuedOnTurn: state.turnNumber,
    }

    return {
      ...state,
      counties: {
        ...state.counties,
        [sourceCountyId]: {
          ...sourceCountyState,
          population: Math.max(
            0,
            sourceCountyState.population - CLAIM_COUNTY_POPULATION_COST,
          ),
        },
      },
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: subtractResourceDelta(playerResources, CLAIM_COUNTY_COST),
      },
      buildQueueByCountyId: {
        ...state.buildQueueByCountyId,
        [targetCountyId]: {
          ...existingQueueState,
          activeOrder: order,
        },
      },
    }
  }

  if (action.type === 'QUEUE_CONQUER_COUNTY') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    if (state.noConquestEnabled) {
      return state
    }

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    const targetCountyId = normalizeCountyId(action.targetCountyId)
    const sourceCountyId = normalizeCountyId(action.sourceCountyId)
    const targetCountyState = state.counties[targetCountyId]
    const sourceCountyState = state.counties[sourceCountyId]
    if (!targetCountyState || !sourceCountyState) {
      return state
    }

    if (
      targetCountyState.ownerId === playerFactionId ||
      targetCountyState.ownerId === NEUTRAL_OWNER_ID
    ) {
      return state
    }

    if (sourceCountyState.ownerId !== playerFactionId) {
      return state
    }

    const existingQueueState =
      state.buildQueueByCountyId[targetCountyId] ?? createEmptyCountyBuildQueue()
    if (hasAnyCountyOrder(existingQueueState)) {
      return state
    }

    if (!hasEnoughResources(playerResources, CONQUER_COUNTY_COST)) {
      return state
    }

    if (sourceCountyState.population < CONQUER_COUNTY_POPULATION_COST) {
      return state
    }

    const turnsRequired = getConquerCountyTurns(
      targetCountyState.buildings.PALISADE ?? 0,
      sourceCountyState.roadLevel,
    )
    const order: CountyBuildOrder = {
      id: createBuildOrderId(
        targetCountyId,
        'CONQUER',
        state.turnNumber,
        existingQueueState,
      ),
      kind: 'CONQUER_COUNTY',
      turnsRemaining: turnsRequired,
      cost: CONQUER_COUNTY_COST,
      sourceCountyId,
      populationCost: CONQUER_COUNTY_POPULATION_COST,
      queuedOnTurn: state.turnNumber,
    }

    return {
      ...state,
      counties: {
        ...state.counties,
        [sourceCountyId]: {
          ...sourceCountyState,
          population: Math.max(
            0,
            sourceCountyState.population - CONQUER_COUNTY_POPULATION_COST,
          ),
        },
      },
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: subtractResourceDelta(playerResources, CONQUER_COUNTY_COST),
      },
      buildQueueByCountyId: {
        ...state.buildQueueByCountyId,
        [targetCountyId]: {
          ...existingQueueState,
          activeOrder: order,
        },
      },
    }
  }

  if (action.type === 'QUEUE_WAREHOUSE_UPGRADE') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    const existingQueueState = state.globalBuildQueue
    const queuedLevels = getQueuedTrackIncrements(existingQueueState, 'WAREHOUSE')
    const nextWarehouseLevel = state.warehouseLevel + queuedLevels + 1
    if (nextWarehouseLevel > MAX_WAREHOUSE_LEVEL) {
      return state
    }

    const turnsRequired = getTrackUpgradeTurns('WAREHOUSE', nextWarehouseLevel)
    if (turnsRequired <= 0) {
      return state
    }

    const upgradeCost = getTrackUpgradeCost('WAREHOUSE', nextWarehouseLevel)
    const storageCaps = getStorageCapsForWarehouseLevel(state.warehouseLevel)
    if (!costFitsStorageCaps(upgradeCost, storageCaps)) {
      return state
    }

    if (!hasEnoughResources(playerResources, upgradeCost)) {
      return state
    }

    const newOrder: CountyBuildOrder = {
      id: createBuildOrderId('GLOBAL', 'WAREHOUSE', state.turnNumber, existingQueueState),
      kind: 'UPGRADE_TRACK',
      trackType: 'WAREHOUSE',
      targetLevelDelta: 1,
      turnsRemaining: turnsRequired,
      cost: upgradeCost,
      queuedOnTurn: state.turnNumber,
    }

    const nextGlobalQueue: CountyBuildQueueState = existingQueueState.activeOrder
      ? {
          ...existingQueueState,
          queuedOrders: [...existingQueueState.queuedOrders, newOrder],
        }
      : {
          ...existingQueueState,
          activeOrder: newOrder,
        }

    return {
      ...state,
      globalBuildQueue: nextGlobalQueue,
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: subtractResourceDelta(playerResources, upgradeCost),
      },
    }
  }

  if (action.type === 'REMOVE_QUEUED_BUILD_ORDER') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const countyId = normalizeCountyId(action.countyId)
    const existingQueueState = countyId ? state.buildQueueByCountyId[countyId] : undefined
    if (!countyId || !existingQueueState) {
      return state
    }

    const queuedOrders = existingQueueState.queuedOrders
    if (action.queueIndex < 0 || action.queueIndex >= queuedOrders.length) {
      return state
    }

    const removedOrder = queuedOrders[action.queueIndex]
    const nextQueuedOrders = queuedOrders.filter((_, index) => index !== action.queueIndex)

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    const nextQueueState: CountyBuildQueueState = {
      ...existingQueueState,
      queuedOrders: nextQueuedOrders,
    }

    const nextBuildQueueByCountyId = { ...state.buildQueueByCountyId }
    if (!nextQueueState.activeOrder && nextQueueState.queuedOrders.length === 0) {
      delete nextBuildQueueByCountyId[countyId]
    } else {
      nextBuildQueueByCountyId[countyId] = nextQueueState
    }

    let nextCounties = state.counties
    if (removedOrder.populationCost && removedOrder.sourceCountyId) {
      const sourceCountyId = normalizeCountyId(removedOrder.sourceCountyId)
      const sourceCounty = state.counties[sourceCountyId]
      if (sourceCounty) {
        nextCounties = {
          ...state.counties,
          [sourceCountyId]: {
            ...sourceCounty,
            population: sourceCounty.population + removedOrder.populationCost,
          },
        }
      }
    }

    return {
      ...state,
      counties: nextCounties,
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: addResourceDelta(playerResources, removedOrder.cost),
      },
      buildQueueByCountyId: nextBuildQueueByCountyId,
    }
  }

  if (action.type === 'REMOVE_QUEUED_WAREHOUSE_ORDER') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const queuedOrders = state.globalBuildQueue.queuedOrders
    if (action.queueIndex < 0 || action.queueIndex >= queuedOrders.length) {
      return state
    }

    const removedOrder = queuedOrders[action.queueIndex]
    const nextQueuedOrders = queuedOrders.filter((_, index) => index !== action.queueIndex)

    const playerFactionId = state.playerFactionId
    if (!playerFactionId) {
      return state
    }

    const playerResources = state.resourcesByKingdomId[playerFactionId]
    if (!playerResources) {
      return state
    }

    return {
      ...state,
      globalBuildQueue: {
        ...state.globalBuildQueue,
        queuedOrders: nextQueuedOrders,
      },
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: addResourceDelta(playerResources, removedOrder.cost),
      },
    }
  }

  if (action.type === 'CLOSE_TURN_REPORT') {
    if (!state.lastTurnReport) {
      return state
    }

    return {
      ...state,
      lastTurnReport: null,
    }
  }

  return state
}
