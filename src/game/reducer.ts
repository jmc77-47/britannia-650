import {
  MAX_TRACK_LEVEL,
  addResourceDelta,
  getTrackUpgradeCost,
  getTrackUpgradeTurns,
  hasEnoughResources,
  subtractResourceDelta,
  type UpgradeTrackType,
} from './buildings'
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
      type: 'QUEUE_TRACK_UPGRADE'
      countyId: string
      trackType: UpgradeTrackType
    }
  | {
      type: 'REMOVE_QUEUED_BUILD_ORDER'
      countyId: string
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

  return county.buildings[trackType] ?? 0
}

const getQueuedTrackIncrements = (
  queueState: CountyBuildQueueState,
  trackType: UpgradeTrackType,
): number => {
  let pendingIncrements = 0

  if (queueState.activeOrder && queueState.activeOrder.trackType === trackType) {
    pendingIncrements += queueState.activeOrder.targetLevelDelta
  }

  queueState.queuedOrders.forEach((order) => {
    if (order.trackType === trackType) {
      pendingIncrements += order.targetLevelDelta
    }
  })

  return pendingIncrements
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
  countyId: string,
  trackType: UpgradeTrackType,
  turnNumber: number,
  queueState: CountyBuildQueueState,
): string => {
  const usedIds = getUsedOrderIds(queueState)
  let sequence = usedIds.size + 1
  let candidate = `${countyId}-${trackType}-${turnNumber}-${sequence}`

  while (usedIds.has(candidate)) {
    sequence += 1
    candidate = `${countyId}-${trackType}-${turnNumber}-${sequence}`
  }

  return candidate
}

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
      lastTurnReport: null,
      fogOfWarEnabled: true,
      superhighwaysEnabled: state.superhighwaysEnabled,
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
      if (!countyState || countyState.roadLevel >= 1) {
        return
      }

      countiesWithOwnedRoadMinimum[countyId] = {
        ...countyState,
        roadLevel: 1,
      }
    })

    const resourcesByKingdomId = {
      ...state.resourcesByKingdomId,
      [playerFactionId]: createStartingResources(),
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
      lastTurnReport: null,
      fogOfWarEnabled: true,
      superhighwaysEnabled: state.superhighwaysEnabled,
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
    if (!hasEnoughResources(playerResources, upgradeCost)) {
      return state
    }

    const newOrder: CountyBuildOrder = {
      id: createBuildOrderId(countyId, action.trackType, state.turnNumber, existingQueueState),
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

    return {
      ...state,
      resourcesByKingdomId: {
        ...state.resourcesByKingdomId,
        [playerFactionId]: addResourceDelta(playerResources, removedOrder.cost),
      },
      buildQueueByCountyId: nextBuildQueueByCountyId,
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
