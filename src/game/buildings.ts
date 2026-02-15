import type { ResourceStockpile } from './state'

export type BuildingType =
  | 'HOMESTEADS'
  | 'LUMBER_CAMP'
  | 'PALISADE'
  | 'QUARRY'
  | 'MINE'
  | 'PASTURE'
  | 'TANNERY'
  | 'WEAVERY'
  | 'MARKET'

export type UpgradeTrackType = BuildingType | 'ROADS'

export type BuildingLevels = Record<BuildingType, number>

export type ResourceKey = keyof ResourceStockpile

export type ResourceDelta = Partial<Record<ResourceKey, number>>

export interface BuildingDefinition {
  id: BuildingType
  label: string
  shortLabel: string
  badge: string
  description: string
  baseCost: ResourceDelta
  yieldsPerTurnPerLevel: ResourceDelta
  defensePerLevel: number
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

export const MAX_TRACK_LEVEL = 20

export const BUILDING_ORDER: BuildingType[] = [
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

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  HOMESTEADS: {
    id: 'HOMESTEADS',
    label: 'Homesteads',
    shortLabel: 'Homesteads',
    badge: 'Settled',
    description: 'Expand local settlement and grow population each turn.',
    baseCost: {
      gold: 70,
      wood: 50,
    },
    yieldsPerTurnPerLevel: {
      population: 2,
    },
    defensePerLevel: 0,
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
  },
  QUARRY: {
    id: 'QUARRY',
    label: 'Quarry',
    shortLabel: 'Quarry',
    badge: 'Stoneworks',
    description: 'Extract local stone for construction and trade.',
    baseCost: {
      gold: 90,
      wood: 35,
    },
    yieldsPerTurnPerLevel: {
      stone: 2,
    },
    defensePerLevel: 0,
  },
  MINE: {
    id: 'MINE',
    label: 'Mine',
    shortLabel: 'Mine',
    badge: 'Ore',
    description: 'Open mineral shafts to increase iron production.',
    baseCost: {
      gold: 105,
      wood: 25,
    },
    yieldsPerTurnPerLevel: {
      iron: 2,
    },
    defensePerLevel: 0,
  },
  PASTURE: {
    id: 'PASTURE',
    label: 'Pasture',
    shortLabel: 'Pasture',
    badge: 'Herds',
    description: 'Raise horse stock with organized grazing lands.',
    baseCost: {
      gold: 85,
      wood: 20,
    },
    yieldsPerTurnPerLevel: {
      horses: 2,
    },
    defensePerLevel: 0,
  },
  TANNERY: {
    id: 'TANNERY',
    label: 'Tannery',
    shortLabel: 'Tannery',
    badge: 'Leatherworks',
    description: 'Process hides into leather for military and trade use.',
    baseCost: {
      gold: 100,
      wood: 30,
    },
    yieldsPerTurnPerLevel: {
      leather: 2,
    },
    defensePerLevel: 0,
  },
  WEAVERY: {
    id: 'WEAVERY',
    label: 'Weavery',
    shortLabel: 'Weavery',
    badge: 'Textiles',
    description: 'Turn fiber into woven output and improve wool flow.',
    baseCost: {
      gold: 95,
      wood: 18,
    },
    yieldsPerTurnPerLevel: {
      wool: 2,
    },
    defensePerLevel: 0,
  },
  MARKET: {
    id: 'MARKET',
    label: 'Market',
    shortLabel: 'Market',
    badge: 'Trade Hub',
    description: 'Formalize commerce and improve tax intake.',
    baseCost: {
      gold: 120,
      wood: 40,
    },
    yieldsPerTurnPerLevel: {
      gold: 2,
    },
    defensePerLevel: 0,
  },
  PALISADE: {
    id: 'PALISADE',
    label: 'Palisade',
    shortLabel: 'Palisade',
    badge: 'Fortified',
    description: 'Raise wooden defenses around the local strongpoint.',
    baseCost: {
      gold: 110,
      wood: 90,
    },
    yieldsPerTurnPerLevel: {},
    defensePerLevel: 2,
  },
}

const RESOURCE_NAME_OVERRIDES: Partial<Record<ResourceKey, string>> = {
  population: 'Pop',
}

export const TRACK_LABEL_BY_ID: Record<UpgradeTrackType, string> = {
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
}

const clampTrackLevel = (level: number): number => {
  if (!Number.isFinite(level)) {
    return 0
  }
  const normalizedLevel = Math.floor(level)
  return Math.max(0, Math.min(MAX_TRACK_LEVEL, normalizedLevel))
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

export const getBuildingUpgradeTurns = (nextLevel: number): number => {
  const level = clampTrackLevel(nextLevel)
  if (level <= 0) {
    return 0
  }
  return 1 + Math.floor((level - 1) / 4)
}

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
    gold: 25 * level * level,
  }

  if (level >= 4) {
    cost.stone = (level - 3) * 12
  }

  return cost
}

export const getTrackUpgradeTurns = (
  trackType: UpgradeTrackType,
  nextLevel: number,
): number =>
  trackType === 'ROADS'
    ? getRoadUpgradeTurns(nextLevel)
    : getBuildingUpgradeTurns(nextLevel)

export const getTrackUpgradeCost = (
  trackType: UpgradeTrackType,
  nextLevel: number,
): ResourceDelta =>
  trackType === 'ROADS'
    ? getRoadUpgradeCost(nextLevel)
    : getBuildingUpgradeCost(trackType, nextLevel)

export const getBuildingYieldForLevel = (
  buildingType: BuildingType,
  level: number,
): ResourceDelta => {
  const clampedLevel = clampTrackLevel(level)
  if (clampedLevel <= 0) {
    return {}
  }

  const definition = BUILDING_DEFINITIONS[buildingType]
  const delta: ResourceDelta = {}

  RESOURCE_KEYS.forEach((resourceKey) => {
    const perLevelAmount = definition.yieldsPerTurnPerLevel[resourceKey] ?? 0
    if (perLevelAmount === 0) {
      return
    }

    delta[resourceKey] = perLevelAmount * clampedLevel
  })

  return delta
}

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
