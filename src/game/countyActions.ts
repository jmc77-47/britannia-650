import {
  createEmptyBuildingLevels,
  type BuildingLevels,
  type ResourceDelta,
} from './buildings'

export const NEUTRAL_OWNER_ID = 'NEUTRAL'

export type CountyActionOrderKind = 'UPGRADE_TRACK' | 'CLAIM_COUNTY' | 'CONQUER_COUNTY'

export const CLAIM_COUNTY_COST: ResourceDelta = {
  gold: 120,
  wood: 80,
}

export const CLAIM_COUNTY_POPULATION_COST = 25

export const getClaimCountyTurns = (_sourceRoadLevel: number): number => 2

export const CONQUER_COUNTY_COST: ResourceDelta = {
  gold: 160,
  wood: 40,
}

export const CONQUER_COUNTY_POPULATION_COST = 35

export const getConquerCountyTurns = (
  targetPalisadeLevel: number,
  sourceRoadLevel: number,
): number => {
  const baseTurns = 2 + Math.floor(Math.max(0, targetPalisadeLevel) / 5)
  const withRoadBonus = sourceRoadLevel >= 10 ? baseTurns - 1 : baseTurns
  return Math.max(2, Math.min(6, withRoadBonus))
}

export const applyConquestDamageToBuildings = (
  buildingLevels: BuildingLevels,
): BuildingLevels => {
  const nextLevels = createEmptyBuildingLevels()

  ;(Object.keys(nextLevels) as Array<keyof BuildingLevels>).forEach((buildingType) => {
    const currentLevel = Math.max(0, Math.floor(buildingLevels[buildingType] ?? 0))
    if (buildingType === 'FARM') {
      nextLevels[buildingType] = Math.max(1, Math.floor(currentLevel * 0.7))
      return
    }

    nextLevels[buildingType] = Math.max(0, Math.floor(currentLevel * 0.7))
  })

  return nextLevels
}

export const getPostConquestRoadLevel = (roadLevel: number): number =>
  Math.max(1, Math.floor(Math.max(0, roadLevel) * 0.5))

export const getPostConquestPopulation = (population: number): number =>
  Math.max(20, Math.floor(Math.max(0, population) * 0.5))
