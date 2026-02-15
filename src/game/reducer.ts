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

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === 'SELECT_COUNTY') {
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
    return resolveTurn(state)
  }

  return state
}
