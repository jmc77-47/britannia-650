import {
  BUILDING_DEFINITIONS,
  BUILDING_ORDER,
  RESOURCE_KEYS,
  addDeltas,
  getBuildingYieldForLevel,
  type ResourceDelta,
  type ResourceKey,
} from './buildings'
import type { GameState } from './state'

export interface ResourceDeltaEntry {
  key: ResourceKey
  label: string
  amount: number
}

export interface TurnYieldSummary {
  totalDelta: ResourceDelta
  contributionLines: string[]
}

const BASE_PLAYER_COUNTY_YIELD: ResourceDelta = {
  gold: 1,
}

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  gold: 'Gold',
  population: 'Population',
  wood: 'Wood',
  stone: 'Stone',
  iron: 'Iron',
  wool: 'Wool',
  leather: 'Leather',
  horses: 'Horses',
}

const formatSignedAmount = (amount: number): string =>
  amount > 0 ? `+${amount}` : `${amount}`

export const getNonZeroResourceDeltaEntries = (
  delta: ResourceDelta,
): ResourceDeltaEntry[] =>
  RESOURCE_KEYS.filter((resourceKey) => (delta[resourceKey] ?? 0) !== 0).map(
    (resourceKey) => ({
      key: resourceKey,
      label: RESOURCE_LABELS[resourceKey],
      amount: delta[resourceKey] ?? 0,
    }),
  )

const getCountyYieldBreakdown = (
  countyId: string,
  state: GameState,
): TurnYieldSummary => {
  if (!state.ownedCountyIds.includes(countyId)) {
    return {
      totalDelta: {},
      contributionLines: [],
    }
  }

  const countyState = state.counties[countyId]
  if (!countyState) {
    return {
      totalDelta: {},
      contributionLines: [],
    }
  }

  let totalDelta: ResourceDelta = { ...BASE_PLAYER_COUNTY_YIELD }
  const countyLabel = `${countyState.name} (${countyId})`
  const contributionLines: string[] = [
    `${countyLabel}: +1 Gold (County base yield)`,
  ]

  BUILDING_ORDER.forEach((buildingType) => {
    const buildingLevel = countyState.buildings[buildingType] ?? 0
    if (buildingLevel <= 0) {
      return
    }

    const scaledYield = getBuildingYieldForLevel(buildingType, buildingLevel)
    totalDelta = addDeltas(totalDelta, scaledYield)

    getNonZeroResourceDeltaEntries(scaledYield).forEach((entry) => {
      contributionLines.push(
        `${countyLabel}: ${formatSignedAmount(entry.amount)} ${entry.label} (${BUILDING_DEFINITIONS[buildingType].label} L${buildingLevel})`,
      )
    })
  })

  return {
    totalDelta,
    contributionLines,
  }
}

export const getCountyYields = (countyId: string, state: GameState): ResourceDelta =>
  getCountyYieldBreakdown(countyId, state).totalDelta

export const getPlayerTurnYieldSummary = (state: GameState): TurnYieldSummary =>
  state.ownedCountyIds.reduce<TurnYieldSummary>(
    (summary, countyId) => {
      const countyYield = getCountyYieldBreakdown(countyId, state)
      return {
        totalDelta: addDeltas(summary.totalDelta, countyYield.totalDelta),
        contributionLines: [...summary.contributionLines, ...countyYield.contributionLines],
      }
    },
    {
      totalDelta: {},
      contributionLines: [],
    },
  )
