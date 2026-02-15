import { resolveTurn } from './resolveTurn'
import {
  canQueueBuilding,
  type BuildingType,
} from './buildings'
import {
  createStartingResources,
  normalizeCountyId,
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
      type: 'QUEUE_BUILD'
      countyId: string
      buildingType: BuildingType
    }
  | {
      type: 'REMOVE_QUEUED_BUILD'
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

  if (action.type === 'QUEUE_BUILD') {
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

    const existingQueue = state.buildQueueByCountyId[countyId] ?? []
    if (!canQueueBuilding(existingQueue, action.buildingType, playerResources)) {
      return state
    }

    return {
      ...state,
      buildQueueByCountyId: {
        ...state.buildQueueByCountyId,
        [countyId]: [...existingQueue, action.buildingType],
      },
    }
  }

  if (action.type === 'REMOVE_QUEUED_BUILD') {
    if (state.gamePhase !== 'playing') {
      return state
    }

    const countyId = normalizeCountyId(action.countyId)
    const existingQueue = state.buildQueueByCountyId[countyId]
    if (!countyId || !existingQueue || action.queueIndex < 0 || action.queueIndex >= existingQueue.length) {
      return state
    }

    const nextQueue = existingQueue.filter((_, index) => index !== action.queueIndex)
    if (nextQueue.length === 0) {
      const { [countyId]: _removedQueue, ...remainingQueues } = state.buildQueueByCountyId
      return {
        ...state,
        buildQueueByCountyId: remainingQueues,
      }
    }

    return {
      ...state,
      buildQueueByCountyId: {
        ...state.buildQueueByCountyId,
        [countyId]: nextQueue,
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
