import { validateOrders } from './orders'
import {
  BUILDING_DEFINITIONS,
  addResourceDelta,
  createZeroResources,
  hasEnoughResources,
  subtractResourceDelta,
} from './buildings'
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

  const nextCounties: GameState['counties'] = { ...state.counties }
  const playerFactionId = state.playerFactionId
  let nextPlayerResources = playerFactionId
    ? (state.resourcesByKingdomId[playerFactionId] ?? createZeroResources())
    : createZeroResources()

  Object.entries(state.buildQueueByCountyId).forEach(([countyId, queue]) => {
    if (!Array.isArray(queue) || queue.length === 0) {
      return
    }

    const countyState = nextCounties[countyId]
    if (!countyState) {
      return
    }

    let nextBuildings = countyState.buildings
    let nextDefense = countyState.defense

    queue.forEach((buildingType) => {
      const definition = BUILDING_DEFINITIONS[buildingType]
      if (!definition) {
        return
      }

      if (!hasEnoughResources(nextPlayerResources, definition.cost)) {
        return
      }

      nextPlayerResources = subtractResourceDelta(nextPlayerResources, definition.cost)
      nextBuildings = [...nextBuildings, buildingType]
      nextDefense += definition.defenseBonus
    })

    nextCounties[countyId] = {
      ...countyState,
      buildings: nextBuildings,
      defense: nextDefense,
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

  Object.values(nextCounties).forEach((countyState) => {
    countyState.buildings.forEach((buildingType) => {
      const definition = BUILDING_DEFINITIONS[buildingType]
      if (!definition) {
        return
      }

      nextPlayerResources = addResourceDelta(nextPlayerResources, definition.yieldsPerTurn)
    })
  })

  const nextResourcesByKingdomId = { ...state.resourcesByKingdomId }
  if (playerFactionId) {
    nextResourcesByKingdomId[playerFactionId] = nextPlayerResources
  }

  return {
    ...state,
    counties: nextCounties,
    resourcesByKingdomId: nextResourcesByKingdomId,
    turnNumber: state.turnNumber + 1,
    buildQueueByCountyId: {},
    pendingOrders: [],
  }
}
