import type { ResourceStockpile } from './state'

export type BuildingType = 'HOMESTEADS' | 'LUMBER_CAMP' | 'PALISADE'

export type ResourceKey = keyof ResourceStockpile

export type ResourceDelta = Partial<Record<ResourceKey, number>>

export interface BuildingDefinition {
  id: BuildingType
  label: string
  shortLabel: string
  badge: string
  description: string
  cost: ResourceDelta
  yieldsPerTurn: ResourceDelta
  defenseBonus: number
}

const RESOURCE_KEYS: ResourceKey[] = [
  'gold',
  'population',
  'wood',
  'stone',
  'iron',
  'wool',
  'leather',
  'horses',
]

export const BUILDING_ORDER: BuildingType[] = [
  'HOMESTEADS',
  'LUMBER_CAMP',
  'PALISADE',
]

export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  HOMESTEADS: {
    id: 'HOMESTEADS',
    label: 'Homesteads',
    shortLabel: 'Homesteads',
    badge: 'Settled',
    description: 'Expand local settlement and grow population each turn.',
    cost: {
      gold: 70,
      wood: 50,
    },
    yieldsPerTurn: {
      population: 120,
    },
    defenseBonus: 0,
  },
  LUMBER_CAMP: {
    id: 'LUMBER_CAMP',
    label: 'Lumber Camp',
    shortLabel: 'Lumber',
    badge: 'Timber',
    description: 'Harvest nearby forests for steady wood production.',
    cost: {
      gold: 80,
    },
    yieldsPerTurn: {
      wood: 24,
    },
    defenseBonus: 0,
  },
  PALISADE: {
    id: 'PALISADE',
    label: 'Palisade',
    shortLabel: 'Palisade',
    badge: 'Fortified',
    description: 'Raise wooden defenses to harden the county border.',
    cost: {
      gold: 110,
      wood: 90,
    },
    yieldsPerTurn: {},
    defenseBonus: 1,
  },
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

const addDeltas = (left: ResourceDelta, right: ResourceDelta): ResourceDelta => {
  const merged: ResourceDelta = {}
  RESOURCE_KEYS.forEach((resourceKey) => {
    const total = (left[resourceKey] ?? 0) + (right[resourceKey] ?? 0)
    if (total > 0) {
      merged[resourceKey] = total
    }
  })
  return merged
}

export const getQueuedCost = (queuedBuildings: BuildingType[]): ResourceDelta =>
  queuedBuildings.reduce<ResourceDelta>(
    (queuedCost, buildingType) =>
      addDeltas(queuedCost, BUILDING_DEFINITIONS[buildingType].cost),
    {},
  )

export const canQueueBuilding = (
  queuedBuildings: BuildingType[],
  buildingType: BuildingType,
  availableResources: ResourceStockpile,
): boolean => {
  const queuedCost = getQueuedCost(queuedBuildings)
  const nextCost = addDeltas(queuedCost, BUILDING_DEFINITIONS[buildingType].cost)
  return hasEnoughResources(availableResources, nextCost)
}

export const formatCostLabel = (cost: ResourceDelta): string =>
  RESOURCE_KEYS.filter((resourceKey) => (cost[resourceKey] ?? 0) > 0)
    .map((resourceKey) => {
      const resourceName =
        resourceKey === 'population'
          ? 'Pop'
          : resourceKey.charAt(0).toUpperCase() + resourceKey.slice(1)
      return `${cost[resourceKey]} ${resourceName}`
    })
    .join(' + ')
