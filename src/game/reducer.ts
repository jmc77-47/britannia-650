import { resolveTurn } from './resolveTurn'
import { normalizeCountyId, type GameState } from './state'

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
    const ownedCountyIds = kingdom
      ? kingdom.countyIds
      : startingCountyId
        ? [startingCountyId]
        : []
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
      playerFactionId: kingdom?.id ?? null,
      playerFactionName: kingdom?.name ?? `${selectedCharacter.name}'s Realm`,
      playerFactionColor: kingdom?.color ?? '#f3c94b',
      ownedCountyIds,
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

  return state
}
