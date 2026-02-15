import type { ResourceStockpile } from './state'

export type BuildingType =
  | 'FARM'
  | 'HOMESTEADS'
  | 'LUMBER_CAMP'
  | 'PALISADE'
  | 'QUARRY'
  | 'MINE'
  | 'PASTURE'
  | 'TANNERY'
  | 'WEAVERY'
  | 'MARKET'

export type UpgradeTrackType = BuildingType | 'ROADS' | 'WAREHOUSE'

export type BuildingLevels = Record<BuildingType, number>

export type ResourceKey = keyof ResourceStockpile

export type StorableResourceKey = Exclude<ResourceKey, 'population'>

export type ResourceDelta = Partial<Record<ResourceKey, number>>

export type StorageCaps = Record<StorableResourceKey, number>

export interface BuildingDefinition {
  id: BuildingType
  label: string
  shortLabel: string
  badge: string
  description: string
  baseCost: ResourceDelta
  yieldsPerTurnPerLevel: ResourceDelta
  defensePerLevel: number
  populationUsagePerLevel: number
}

export const RESOURCE_KEYS: ResourceKey[] = [
  'gold',
  'population',
  'wood',
  'stone',
  'iron',
  'wool',
  'leather',
  'horses',
]

export const STORABLE_RESOURCE_KEYS: StorableResourceKey[] = [
  'gold',
  'wood',
  'stone',
  'iron',
  'wool',
  'leather',
  'horses',
]

export const MAX_TRACK_LEVEL = 20
export const MAX_WAREHOUSE_LEVEL = 20

export const BUILDING_ORDER: BuildingType[] = [
  'FARM',
  'HOMESTEADS',
  'LUMBER_CAMP',
  'QUARRY',
  'MINE',
  'PASTURE',
  'TANNERY',
  'WEAVERY',
  'MARKET',
  'PALISADE',
]

const BUILDING_SLOT_EXEMPT_TYPES = new Set<BuildingType>(['FARM', 'PALISADE'])

const WAREHOUSE_CAP_BASE: StorageCaps = {
  gold: 800,
  wood: 400,
  stone: 250,
  iron: 150,
  wool: 200,
  leather: 150,
  horses: 80,
}

const WAREHOUSE_CAP_PER_LEVEL: StorageCaps = {
  gold: 250,
  wood: 150,
  stone: 100,
  iron: 60,
  wool: 80,
  leather: 60,
  horses: 25,
}

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  FARM: {
    id: 'FARM',
    label: 'Farm',
    shortLabel: 'Farm',
    badge: 'Agrarian',
    description: 'Expands county population capacity and unlocks specialization room.',
    baseCost: {
      gold: 55,
      wood: 32,
    },
    yieldsPerTurnPerLevel: {},
    defensePerLevel: 0,
    populationUsagePerLevel: 0,
  },
  HOMESTEADS: {
    id: 'HOMESTEADS',
    label: 'Homesteads',
    shortLabel: 'Homesteads',
    badge: 'Settled',
    description: 'Expand local settlement and drive population growth each turn.',
    baseCost: {
      gold: 72,
      wood: 52,
    },
    yieldsPerTurnPerLevel: {
      population: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 1,
  },
  LUMBER_CAMP: {
    id: 'LUMBER_CAMP',
    label: 'Lumber Camp',
    shortLabel: 'Lumber',
    badge: 'Timber',
    description: 'Harvest nearby forests for steady wood production.',
    baseCost: {
      gold: 80,
    },
    yieldsPerTurnPerLevel: {
      wood: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 2,
  },
  QUARRY: {
    id: 'QUARRY',
    label: 'Quarry',
    shortLabel: 'Quarry',
    badge: 'Stoneworks',
    description: 'Extract local stone for construction and trade.',
    baseCost: {
      gold: 78,
      wood: 28,
    },
    yieldsPerTurnPerLevel: {
      stone: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 2,
  },
  MINE: {
    id: 'MINE',
    label: 'Mine',
    shortLabel: 'Mine',
    badge: 'Ore',
    description: 'Open mineral shafts to increase iron production.',
    baseCost: {
      gold: 60,
      wood: 20,
      stone: 10,
    },
    yieldsPerTurnPerLevel: {
      iron: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 3,
  },
  PASTURE: {
    id: 'PASTURE',
    label: 'Pasture',
    shortLabel: 'Pasture',
    badge: 'Herds',
    description: 'Raise horse stock with organized grazing lands.',
    baseCost: {
      gold: 82,
      wood: 18,
    },
    yieldsPerTurnPerLevel: {
      horses: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 1,
  },
  TANNERY: {
    id: 'TANNERY',
    label: 'Tannery',
    shortLabel: 'Tannery',
    badge: 'Leatherworks',
    description: 'Process hides into leather for military and trade use.',
    baseCost: {
      gold: 88,
      wood: 24,
    },
    yieldsPerTurnPerLevel: {
      leather: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 2,
  },
  WEAVERY: {
    id: 'WEAVERY',
    label: 'Weavery',
    shortLabel: 'Weavery',
    badge: 'Textiles',
    description: 'Turn fiber into woven output and improve wool flow.',
    baseCost: {
      gold: 84,
      wood: 20,
    },
    yieldsPerTurnPerLevel: {
      wool: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 2,
  },
  MARKET: {
    id: 'MARKET',
    label: 'Market',
    shortLabel: 'Market',
    badge: 'Trade Hub',
    description: 'Formalize commerce and improve tax intake.',
    baseCost: {
      gold: 110,
      wood: 32,
    },
    yieldsPerTurnPerLevel: {
      gold: 2,
    },
    defensePerLevel: 0,
    populationUsagePerLevel: 2,
  },
  PALISADE: {
    id: 'PALISADE',
    label: 'Palisade',
    shortLabel: 'Palisade',
    badge: 'Fortified',
    description: 'Raise wooden defenses around the local strongpoint.',
    baseCost: {
      gold: 105,
      wood: 80,
    },
    yieldsPerTurnPerLevel: {},
    defensePerLevel: 2,
    populationUsagePerLevel: 1,
  },
}

const RESOURCE_NAME_OVERRIDES: Partial<Record<ResourceKey, string>> = {
  population: 'Pop',
}

export const TRACK_LABEL_BY_ID: Record<UpgradeTrackType, string> = {
  FARM: BUILDING_DEFINITIONS.FARM.label,
  HOMESTEADS: BUILDING_DEFINITIONS.HOMESTEADS.label,
  LUMBER_CAMP: BUILDING_DEFINITIONS.LUMBER_CAMP.label,
  PALISADE: BUILDING_DEFINITIONS.PALISADE.label,
  QUARRY: BUILDING_DEFINITIONS.QUARRY.label,
  MINE: BUILDING_DEFINITIONS.MINE.label,
  PASTURE: BUILDING_DEFINITIONS.PASTURE.label,
  TANNERY: BUILDING_DEFINITIONS.TANNERY.label,
  WEAVERY: BUILDING_DEFINITIONS.WEAVERY.label,
  MARKET: BUILDING_DEFINITIONS.MARKET.label,
  ROADS: 'Roads',
  WAREHOUSE: 'Warehouse',
}

const clampTrackLevel = (level: number): number => {
  if (!Number.isFinite(level)) {
    return 0
  }
  const normalizedLevel = Math.floor(level)
  return Math.max(0, Math.min(MAX_TRACK_LEVEL, normalizedLevel))
}

export const clampWarehouseLevel = (level: number): number => {
  if (!Number.isFinite(level)) {
    return 0
  }
  return Math.max(0, Math.min(MAX_WAREHOUSE_LEVEL, Math.floor(level)))
}

export const isBuildingTrack = (trackType: UpgradeTrackType): trackType is BuildingType =>
  trackType in BUILDING_DEFINITIONS

export const doesBuildingTrackConsumeSlot = (buildingType: BuildingType): boolean =>
  !BUILDING_SLOT_EXEMPT_TYPES.has(buildingType)

export const getPopulationUsagePerLevelForTrack = (
  trackType: UpgradeTrackType,
): number => {
  if (!isBuildingTrack(trackType)) {
    return 0
  }

  return BUILDING_DEFINITIONS[trackType].populationUsagePerLevel
}

export const createZeroResources = (): ResourceStockpile => ({
  gold: 0,
  population: 0,
  wood: 0,
  stone: 0,
  iron: 0,
  wool: 0,
  leather: 0,
  horses: 0,
})

export const createEmptyBuildingLevels = (): BuildingLevels => ({
  FARM: 0,
  HOMESTEADS: 0,
  LUMBER_CAMP: 0,
  PALISADE: 0,
  QUARRY: 0,
  MINE: 0,
  PASTURE: 0,
  TANNERY: 0,
  WEAVERY: 0,
  MARKET: 0,
})

const normalizeBuildingType = (
  value: unknown,
): BuildingType | null => {
  if (typeof value !== 'string') {
    return null
  }
  const normalizedValue = value.trim().toUpperCase()
  if (normalizedValue in BUILDING_DEFINITIONS) {
    return normalizedValue as BuildingType
  }
  return null
}

export const normalizeBuildingLevels = (rawBuildings: unknown): BuildingLevels => {
  const normalized = createEmptyBuildingLevels()

  if (Array.isArray(rawBuildings)) {
    rawBuildings.forEach((entry) => {
      const buildingType = normalizeBuildingType(entry)
      if (!buildingType) {
        return
      }
      normalized[buildingType] = clampTrackLevel(normalized[buildingType] + 1)
    })
    return normalized
  }

  if (!rawBuildings || typeof rawBuildings !== 'object') {
    return normalized
  }

  Object.entries(rawBuildings as Record<string, unknown>).forEach(
    ([buildingTypeKey, levelValue]) => {
      const buildingType = normalizeBuildingType(buildingTypeKey)
      if (!buildingType || typeof levelValue !== 'number') {
        return
      }
      normalized[buildingType] = clampTrackLevel(levelValue)
    },
  )

  return normalized
}

export const addResourceDelta = (
  resources: ResourceStockpile,
  delta: ResourceDelta,
): ResourceStockpile => {
  const nextResources: ResourceStockpile = { ...resources }
  RESOURCE_KEYS.forEach((resourceKey) => {
    const deltaValue = delta[resourceKey] ?? 0
    nextResources[resourceKey] = nextResources[resourceKey] + deltaValue
  })
  return nextResources
}

export const subtractResourceDelta = (
  resources: ResourceStockpile,
  delta: ResourceDelta,
): ResourceStockpile => {
  const nextResources: ResourceStockpile = { ...resources }
  RESOURCE_KEYS.forEach((resourceKey) => {
    const deltaValue = delta[resourceKey] ?? 0
    nextResources[resourceKey] = nextResources[resourceKey] - deltaValue
  })
  return nextResources
}

export const hasEnoughResources = (
  resources: ResourceStockpile,
  cost: ResourceDelta,
): boolean =>
  RESOURCE_KEYS.every((resourceKey) => resources[resourceKey] >= (cost[resourceKey] ?? 0))

export const addDeltas = (left: ResourceDelta, right: ResourceDelta): ResourceDelta => {
  const merged: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const total = (left[resourceKey] ?? 0) + (right[resourceKey] ?? 0)
    if (total !== 0) {
      merged[resourceKey] = total
    }
  })
  return merged
}

const scaleCostValueForLevel = (baseValue: number, nextLevel: number): number => {
  const level = clampTrackLevel(nextLevel)
  if (baseValue <= 0 || level <= 0) {
    return 0
  }
  const multiplier = 1 + (level - 1) * 0.25
  return Math.max(1, Math.round(baseValue * multiplier))
}

export const getYieldMilestoneMultiplier = (level: number): number => {
  const clampedLevel = clampTrackLevel(level)
  if (clampedLevel >= 20) {
    return 1.5
  }
  if (clampedLevel >= 15) {
    return 1.35
  }
  if (clampedLevel >= 10) {
    return 1.2
  }
  if (clampedLevel >= 5) {
    return 1.1
  }
  return 1
}

export const getBuildingUpgradeTurns = (nextLevel: number): number => {
  const level = clampTrackLevel(nextLevel)
  if (level <= 0) {
    return 0
  }
  return 1 + Math.floor((level - 1) / 4)
}

export const getWarehouseUpgradeTurns = (nextLevel: number): number =>
  getBuildingUpgradeTurns(nextLevel)

export const getBuildingUpgradeCost = (
  buildingType: BuildingType,
  nextLevel: number,
): ResourceDelta => {
  const level = clampTrackLevel(nextLevel)
  if (level <= 0) {
    return {}
  }

  const definition = BUILDING_DEFINITIONS[buildingType]
  const scaledCost: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const baseValue = definition.baseCost[resourceKey] ?? 0
    const scaledValue = scaleCostValueForLevel(baseValue, level)
    if (scaledValue > 0) {
      scaledCost[resourceKey] = scaledValue
    }
  })
  return scaledCost
}

export const getWarehouseUpgradeCost = (nextWarehouseLevel: number): ResourceDelta => {
  const level = clampWarehouseLevel(nextWarehouseLevel)
  if (level <= 0) {
    return {}
  }

  const baseCost: ResourceDelta = {
    gold: 220,
    wood: 130,
    stone: 90,
  }

  const scaledCost: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const baseValue = baseCost[resourceKey] ?? 0
    const scaledValue = scaleCostValueForLevel(baseValue, level)
    if (scaledValue > 0) {
      scaledCost[resourceKey] = scaledValue
    }
  })

  return scaledCost
}

export const getRoadUpgradeTurns = (nextRoadLevel: number): number => {
  const level = clampTrackLevel(nextRoadLevel)
  if (level <= 0) {
    return 0
  }
  if (level <= 3) {
    return 1
  }
  if (level <= 10) {
    return 2
  }
  return 3
}

export const getRoadUpgradeCost = (nextRoadLevel: number): ResourceDelta => {
  const level = clampTrackLevel(nextRoadLevel)
  if (level <= 0) {
    return {}
  }

  if (level === 1) {
    return {
      gold: 10,
    }
  }

  const cost: ResourceDelta = {
    gold: 14 * level * level,
  }

  if (level >= 4) {
    cost.stone = (level - 3) * 12
  }

  return cost
}

export const getTrackUpgradeTurns = (
  trackType: UpgradeTrackType,
  nextLevel: number,
): number => {
  if (trackType === 'ROADS') {
    return getRoadUpgradeTurns(nextLevel)
  }

  if (trackType === 'WAREHOUSE') {
    return getWarehouseUpgradeTurns(nextLevel)
  }

  return getBuildingUpgradeTurns(nextLevel)
}

export const getTrackUpgradeCost = (
  trackType: UpgradeTrackType,
  nextLevel: number,
): ResourceDelta => {
  if (trackType === 'ROADS') {
    return getRoadUpgradeCost(nextLevel)
  }

  if (trackType === 'WAREHOUSE') {
    return getWarehouseUpgradeCost(nextLevel)
  }

  return getBuildingUpgradeCost(trackType, nextLevel)
}

export const getStorageCapsForWarehouseLevel = (
  warehouseLevel: number,
): StorageCaps => {
  const level = Math.max(1, clampWarehouseLevel(warehouseLevel))
  const growthLevels = level - 1
  return {
    gold: WAREHOUSE_CAP_BASE.gold + WAREHOUSE_CAP_PER_LEVEL.gold * growthLevels,
    wood: WAREHOUSE_CAP_BASE.wood + WAREHOUSE_CAP_PER_LEVEL.wood * growthLevels,
    stone: WAREHOUSE_CAP_BASE.stone + WAREHOUSE_CAP_PER_LEVEL.stone * growthLevels,
    iron: WAREHOUSE_CAP_BASE.iron + WAREHOUSE_CAP_PER_LEVEL.iron * growthLevels,
    wool: WAREHOUSE_CAP_BASE.wool + WAREHOUSE_CAP_PER_LEVEL.wool * growthLevels,
    leather: WAREHOUSE_CAP_BASE.leather + WAREHOUSE_CAP_PER_LEVEL.leather * growthLevels,
    horses: WAREHOUSE_CAP_BASE.horses + WAREHOUSE_CAP_PER_LEVEL.horses * growthLevels,
  }
}

export const getMaxStorageCapsAtWarehouseLevel20 = (): StorageCaps =>
  getStorageCapsForWarehouseLevel(MAX_WAREHOUSE_LEVEL)

export const costFitsStorageCaps = (
  cost: ResourceDelta,
  storageCaps: StorageCaps,
): boolean =>
  STORABLE_RESOURCE_KEYS.every(
    (resourceKey) => (cost[resourceKey] ?? 0) <= storageCaps[resourceKey],
  )

export const getStorageShortfallsForCost = (
  cost: ResourceDelta,
  storageCaps: StorageCaps,
): Array<{ resourceKey: StorableResourceKey; required: number; cap: number }> =>
  STORABLE_RESOURCE_KEYS.filter(
    (resourceKey) => (cost[resourceKey] ?? 0) > storageCaps[resourceKey],
  ).map((resourceKey) => ({
    resourceKey,
    required: cost[resourceKey] ?? 0,
    cap: storageCaps[resourceKey],
  }))

export const getMaxAffordableCostForTrackAtWarehouseLevel = (
  trackType: UpgradeTrackType,
  nextLevel: number,
  warehouseLevel: number,
): ResourceDelta => {
  const rawCost = getTrackUpgradeCost(trackType, nextLevel)
  const storageCaps = getStorageCapsForWarehouseLevel(warehouseLevel)
  const boundedCost: ResourceDelta = { ...rawCost }

  STORABLE_RESOURCE_KEYS.forEach((resourceKey) => {
    const costValue = rawCost[resourceKey] ?? 0
    if (costValue > storageCaps[resourceKey]) {
      boundedCost[resourceKey] = storageCaps[resourceKey]
    }
  })

  return boundedCost
}

export const getBuildingYieldForLevel = (
  buildingType: BuildingType,
  level: number,
): ResourceDelta => {
  const clampedLevel = clampTrackLevel(level)
  if (clampedLevel <= 0) {
    return {}
  }

  const definition = BUILDING_DEFINITIONS[buildingType]
  const multiplier = getYieldMilestoneMultiplier(clampedLevel)
  const delta: ResourceDelta = {}

  RESOURCE_KEYS.forEach((resourceKey) => {
    const perLevelAmount = definition.yieldsPerTurnPerLevel[resourceKey] ?? 0
    if (perLevelAmount === 0) {
      return
    }

    const scaledValue = Math.round(perLevelAmount * clampedLevel * multiplier)
    if (scaledValue !== 0) {
      delta[resourceKey] = scaledValue
    }
  })

  return delta
}

export const getPopulationCapForFarmLevel = (farmLevel: number): number => {
  const clampedFarmLevel = clampTrackLevel(farmLevel)
  if (clampedFarmLevel <= 0) {
    return 0
  }

  return 120 + (clampedFarmLevel - 1) * 45
}

export const getBuildSlotsCapForFarmLevel = (farmLevel: number): number =>
  Math.min(7, 2 + Math.floor(clampTrackLevel(farmLevel) / 4))

export const getPopulationUsedForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number =>
  BUILDING_ORDER.reduce((populationUsed, buildingType) => {
    const level = buildingLevels[buildingType] ?? 0
    if (level <= 0) {
      return populationUsed
    }

    return (
      populationUsed +
      level * BUILDING_DEFINITIONS[buildingType].populationUsagePerLevel
    )
  }, 0)

export const getBuildSlotsUsedForBuildingLevels = (
  buildingLevels: BuildingLevels,
): number =>
  BUILDING_ORDER.reduce((slotsUsed, buildingType) => {
    const level = buildingLevels[buildingType] ?? 0
    if (level <= 0 || !doesBuildingTrackConsumeSlot(buildingType)) {
      return slotsUsed
    }

    return slotsUsed + 1
  }, 0)

export const getCountyDefenseFromBuildingLevels = (
  buildingLevels: BuildingLevels,
): number =>
  Math.max(
    0,
    (buildingLevels.PALISADE ?? 0) * BUILDING_DEFINITIONS.PALISADE.defensePerLevel,
  )

export const formatCostLabel = (cost: ResourceDelta): string => {
  const entries = RESOURCE_KEYS.filter((resourceKey) => (cost[resourceKey] ?? 0) > 0)
  if (entries.length === 0) {
    return 'No cost'
  }

  return entries
    .map((resourceKey) => {
      const resourceName =
        RESOURCE_NAME_OVERRIDES[resourceKey] ??
        resourceKey.charAt(0).toUpperCase() + resourceKey.slice(1)
      return `${cost[resourceKey]} ${resourceName}`
    })
    .join(' + ')
}

const validateUpgradeCostInvariant = () => {
  const maxCaps = getMaxStorageCapsAtWarehouseLevel20()
  const tracksToValidate: UpgradeTrackType[] = ['WAREHOUSE', 'ROADS', ...BUILDING_ORDER]

  tracksToValidate.forEach((trackType) => {
    for (let level = 1; level <= MAX_TRACK_LEVEL; level += 1) {
      const cost = getTrackUpgradeCost(trackType, level)
      const offendingResource = STORABLE_RESOURCE_KEYS.find(
        (resourceKey) => (cost[resourceKey] ?? 0) > maxCaps[resourceKey],
      )

      if (!offendingResource) {
        continue
      }

      console.warn(
        `[Economy] Cost invariant violation: ${trackType} L${level} requires ${cost[offendingResource]} ${offendingResource}, max warehouse cap is ${maxCaps[offendingResource]}.`,
      )
    }
  })
}

if (import.meta.env.DEV) {
  validateUpgradeCostInvariant()
}
