import {
  BUILDING_DEFINITIONS,
  BUILDING_ORDER,
  RESOURCE_KEYS,
  STORABLE_RESOURCE_KEYS,
  addDeltas,
  getBuildSlotsCapForFarmLevel,
  getBuildSlotsUsedForBuildingLevels,
  getBuildingYieldForLevel,
  getPopulationCapForFarmLevel,
  getPopulationUsedForBuildingLevels,
  getStorageCapsForWarehouseLevel,
  type BuildingLevels,
  type ResourceDelta,
  type ResourceKey,
} from './buildings'
import type { CountyGameState, GameState, ResourceStockpile } from './state'

export interface ResourceDeltaEntry {
  key: ResourceKey
  label: string
  amount: number
}

export interface CountyDerivedStats {
  population: number
  populationCap: number
  populationUsed: number
  populationFree: number
  workforceRatio: number
  buildSlotsUsed: number
  buildSlotsCap: number
}

export interface TurnYieldSummary {
  totalDelta: ResourceDelta
  contributionLines: string[]
  countyPopulationDeltas: Record<string, number>
}

export interface StorageClampResult {
  resources: ResourceStockpile
  wastedDelta: ResourceDelta
  wasteLines: string[]
}

const BASE_PLAYER_COUNTY_YIELD: ResourceDelta = {
  gold: 8,
  wood: 6,
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

const floorToNonNegativeInteger = (value: number): number =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))

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

const scaleResourceDelta = (
  delta: ResourceDelta,
  multiplier: number,
): ResourceDelta => {
  const scaledDelta: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const baseValue = delta[resourceKey] ?? 0
    if (baseValue === 0) {
      return
    }

    const scaledValue = Math.max(0, Math.round(baseValue * multiplier))
    if (scaledValue !== 0) {
      scaledDelta[resourceKey] = scaledValue
    }
  })
  return scaledDelta
}

export const getCountyPopulationCapForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number => getPopulationCapForFarmLevel(buildingLevels.FARM ?? 0)

export const getCountyPopulationUsedForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number => getPopulationUsedForBuildingLevels(buildingLevels)

export const getCountyBuildSlotsCapForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number => getBuildSlotsCapForFarmLevel(buildingLevels.FARM ?? 0)

export const getCountyBuildSlotsUsedForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number => getBuildSlotsUsedForBuildingLevels(buildingLevels)

export const getCountyDerivedStats = (
  countyState: CountyGameState,
): CountyDerivedStats => {
  const populationCap = getCountyPopulationCapForBuildingLevels(countyState.buildings)
  const populationUsed = getCountyPopulationUsedForBuildingLevels(countyState.buildings)
  const population = floorToNonNegativeInteger(countyState.population)
  const populationFree = Math.max(0, population - populationUsed)
  const workforceRatio =
    populationUsed <= 0 ? 1 : Math.max(0, Math.min(1, population / populationUsed))

  return {
    population,
    populationCap,
    populationUsed,
    populationFree,
    workforceRatio,
    buildSlotsUsed: getCountyBuildSlotsUsedForBuildingLevels(countyState.buildings),
    buildSlotsCap: getCountyBuildSlotsCapForBuildingLevels(countyState.buildings),
  }
}

const getCountyYieldBreakdown = (
  countyId: string,
  state: GameState,
): TurnYieldSummary => {
  if (!state.ownedCountyIds.includes(countyId)) {
    return {
      totalDelta: {},
      contributionLines: [],
      countyPopulationDeltas: {},
    }
  }

  const countyState = state.counties[countyId]
  if (!countyState) {
    return {
      totalDelta: {},
      contributionLines: [],
      countyPopulationDeltas: {},
    }
  }

  const countyStats = getCountyDerivedStats(countyState)

  let totalDelta: ResourceDelta = { ...BASE_PLAYER_COUNTY_YIELD }
  const countyLabel = `${countyState.name} (${countyId})`
  const contributionLines: string[] = [
    `${countyLabel}: +8 Gold, +6 Wood (County base income)`,
  ]

  let populationDeltaForCounty = 0

  BUILDING_ORDER.forEach((buildingType) => {
    const buildingLevel = countyState.buildings[buildingType] ?? 0
    if (buildingLevel <= 0) {
      return
    }

    const baseYield = getBuildingYieldForLevel(buildingType, buildingLevel)
    let adjustedYield = scaleResourceDelta(baseYield, countyStats.workforceRatio)

    if (buildingType === 'HOMESTEADS') {
      const potentialGrowth = adjustedYield.population ?? 0
      const availableCapacity = Math.max(
        0,
        countyStats.populationCap - (countyStats.population + populationDeltaForCounty),
      )
      const appliedGrowth = Math.min(potentialGrowth, availableCapacity)
      if (appliedGrowth > 0) {
        adjustedYield = {
          ...adjustedYield,
          population: appliedGrowth,
        }
      } else {
        const { population: _population, ...withoutPopulation } = adjustedYield
        adjustedYield = withoutPopulation
      }
      populationDeltaForCounty += appliedGrowth
    }

    totalDelta = addDeltas(totalDelta, adjustedYield)

    getNonZeroResourceDeltaEntries(adjustedYield).forEach((entry) => {
      contributionLines.push(
        `${countyLabel}: ${formatSignedAmount(entry.amount)} ${entry.label} (${BUILDING_DEFINITIONS[buildingType].label} L${buildingLevel})`,
      )
    })
  })

  if (countyStats.workforceRatio < 1 && countyStats.populationUsed > 0) {
    contributionLines.push(
      `${countyLabel}: Workforce shortage (${Math.round(
        countyStats.workforceRatio * 100,
      )}% efficiency)`,
    )
  }

  return {
    totalDelta,
    contributionLines,
    countyPopulationDeltas: {
      [countyId]: populationDeltaForCounty,
    },
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
        countyPopulationDeltas: {
          ...summary.countyPopulationDeltas,
          ...countyYield.countyPopulationDeltas,
        },
      }
    },
    {
      totalDelta: {},
      contributionLines: [],
      countyPopulationDeltas: {},
    },
  )

export const clampResourcesToStorageCaps = (
  resources: ResourceStockpile,
  warehouseLevel: number,
): StorageClampResult => {
  const storageCaps = getStorageCapsForWarehouseLevel(warehouseLevel)
  const nextResources: ResourceStockpile = { ...resources }
  const wastedDelta: ResourceDelta = {}
  const wasteLines: string[] = []

  STORABLE_RESOURCE_KEYS.forEach((resourceKey) => {
    const currentValue = floorToNonNegativeInteger(nextResources[resourceKey])
    const capValue = storageCaps[resourceKey]
    if (currentValue <= capValue) {
      nextResources[resourceKey] = currentValue
      return
    }

    const wastedAmount = currentValue - capValue
    nextResources[resourceKey] = capValue
    wastedDelta[resourceKey] = wastedAmount
    wasteLines.push(
      `Storage full: +${wastedAmount} ${RESOURCE_LABELS[resourceKey]} wasted`,
    )
  })

  nextResources.population = floorToNonNegativeInteger(nextResources.population)

  return {
    resources: nextResources,
    wastedDelta,
    wasteLines,
  }
}

export const getPlayerPopulationTotals = (
  state: GameState,
): { total: number; used: number; free: number; cap: number } => {
  const totals = state.ownedCountyIds.reduce(
    (summary, countyId) => {
      const countyState = state.counties[countyId]
      if (!countyState) {
        return summary
      }

      const countyStats = getCountyDerivedStats(countyState)
      return {
        total: summary.total + countyStats.population,
        used: summary.used + countyStats.populationUsed,
        free: summary.free + countyStats.populationFree,
        cap: summary.cap + countyStats.populationCap,
      }
    },
    {
      total: 0,
      used: 0,
      free: 0,
      cap: 0,
    },
  )

  return totals
}

export const getResourceDeltaBetweenStockpiles = (
  previousResources: ResourceStockpile,
  nextResources: ResourceStockpile,
): ResourceDelta => {
  const delta: ResourceDelta = {}

  RESOURCE_KEYS.forEach((resourceKey) => {
    const amount = (nextResources[resourceKey] ?? 0) - (previousResources[resourceKey] ?? 0)
    if (amount !== 0) {
      delta[resourceKey] = amount
    }
  })

  return delta
}
