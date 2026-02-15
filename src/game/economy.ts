import {
  BUILDING_DEFINITIONS,
  RESOURCE_KEYS,
  type BuildingType,
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

const addResourceDeltas = (left: ResourceDelta, right: ResourceDelta): ResourceDelta => {
  const combined: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const total = (left[resourceKey] ?? 0) + (right[resourceKey] ?? 0)
    if (total !== 0) {
      combined[resourceKey] = total
    }
  })
  return combined
}

const scaleResourceDelta = (delta: ResourceDelta, multiplier: number): ResourceDelta => {
  const scaled: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const scaledValue = (delta[resourceKey] ?? 0) * multiplier
    if (scaledValue !== 0) {
      scaled[resourceKey] = scaledValue
    }
  })
  return scaled
}

const formatSignedAmount = (amount: number): string => (amount > 0 ? `+${amount}` : `${amount}`)

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

  const buildingCounts = countyState.buildings.reduce<Record<BuildingType, number>>(
    (counts, buildingType) => ({
      ...counts,
      [buildingType]: (counts[buildingType] ?? 0) + 1,
    }),
    {
      HOMESTEADS: 0,
      LUMBER_CAMP: 0,
      PALISADE: 0,
    },
  )

  ;(Object.keys(buildingCounts) as BuildingType[]).forEach((buildingType) => {
    const buildingCount = buildingCounts[buildingType]
    if (buildingCount <= 0) {
      return
    }

    const definition = BUILDING_DEFINITIONS[buildingType]
    const scaledYield = scaleResourceDelta(definition.yieldsPerTurn, buildingCount)
    totalDelta = addResourceDeltas(totalDelta, scaledYield)

    getNonZeroResourceDeltaEntries(scaledYield).forEach((entry) => {
      const buildingSuffix = buildingCount > 1 ? ` x${buildingCount}` : ''
      contributionLines.push(
        `${countyLabel}: ${formatSignedAmount(entry.amount)} ${entry.label} (${definition.label}${buildingSuffix})`,
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
        totalDelta: addResourceDeltas(summary.totalDelta, countyYield.totalDelta),
        contributionLines: [...summary.contributionLines, ...countyYield.contributionLines],
      }
    },
    {
      totalDelta: {},
      contributionLines: [],
    },
  )
