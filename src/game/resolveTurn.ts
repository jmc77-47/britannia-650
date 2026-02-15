import { validateOrders } from './orders'
import type { GameState } from './state'

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

  return {
    ...state,
    turnNumber: state.turnNumber + 1,
    pendingOrders: [],
  }
}
