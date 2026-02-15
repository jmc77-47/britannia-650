import type { MacroOrder } from './orders'
import {
  createEmptyBuildingLevels,
  getCountyDefenseFromBuildingLevels,
  getPopulationCapForFarmLevel,
  normalizeBuildingLevels,
  type BuildingLevels,
  type ResourceDelta,
  type UpgradeTrackType,
} from './buildings'
import { assetUrl } from '../lib/assetUrl'

export type GamePhase = 'setup' | 'playing'

export interface CountyGameState {
  id: string
  name: string
  buildings: BuildingLevels
  defense: number
  prosperity: number
  roadLevel: number
  population: number
}

export interface CountyBuildOrder {
  id: string
  trackType: UpgradeTrackType
  targetLevelDelta: 1
  turnsRemaining: number
  cost: ResourceDelta
  queuedOnTurn: number
}

export interface CountyBuildQueueState {
  activeOrder: CountyBuildOrder | null
  queuedOrders: CountyBuildOrder[]
}

export interface StartCharacter {
  id: string
  name: string
  startCountyId: string
}

export interface KingdomGameState {
  id: string
  name: string
  color: string
  countyIds: string[]
}

export interface ResourceStockpile {
  gold: number
  population: number
  wood: number
  stone: number
  iron: number
  wool: number
  leather: number
  horses: number
}

export interface TurnReport {
  turnNumber: number
  resourceDeltas: ResourceDelta
  topContributions: string[]
}

export interface GameState {
  gamePhase: GamePhase
  turnNumber: number
  selectedCountyId: string | null
  selectedCharacterId: string | null
  startingCountyId: string | null
  playerFactionId: string | null
  playerFactionName: string | null
  playerFactionColor: string | null
  ownedCountyIds: string[]
  resourcesByKingdomId: Record<string, ResourceStockpile>
  buildQueueByCountyId: Record<string, CountyBuildQueueState>
  globalBuildQueue: CountyBuildQueueState
  warehouseLevel: number
  lastTurnReport: TurnReport | null
  fogOfWarEnabled: boolean
  superhighwaysEnabled: boolean
  discoveredCountyIds: string[]
  availableCharacters: StartCharacter[]
  kingdoms: KingdomGameState[]
  counties: Record<string, CountyGameState>
  pendingOrders: MacroOrder[]
}

const COUNTY_METADATA_PATH = 'data/county_metadata.json'
const STARTS_PATH = 'data/starts.json'
const KINGDOMS_PATH = 'data/kingdoms.json'
const KINGDOM_COLORS = [
  '#6d8db8',
  '#7c9e5e',
  '#9b7fb7',
  '#b3815b',
  '#5da3a6',
  '#9f8a4f',
  '#557fb1',
  '#9f6f92',
]

interface CountyMetadataRecord {
  id?: unknown
  displayName?: unknown
  prosperityBase?: unknown
  roadLevel?: unknown
  buildings?: unknown
  defense?: unknown
  population?: unknown
}

interface StartCharacterRecord {
  id?: unknown
  name?: unknown
  startCountyId?: unknown
}

interface StartsPayload {
  starts?: unknown
}

interface KingdomRecord {
  id?: unknown
  name?: unknown
  countyIds?: unknown
}

interface KingdomsPayload {
  kingdoms?: unknown
}

export const normalizeCountyId = (countyId: string | null | undefined): string =>
  countyId?.trim().toUpperCase() ?? ''

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

export const createStartingResources = (): ResourceStockpile => ({
  gold: 500,
  population: 0,
  wood: 260,
  stone: 60,
  iron: 20,
  wool: 25,
  leather: 15,
  horses: 6,
})

export const createEmptyCountyBuildQueue = (): CountyBuildQueueState => ({
  activeOrder: null,
  queuedOrders: [],
})

const parseCountyState = (payload: unknown): Record<string, CountyGameState> => {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const counties: Record<string, CountyGameState> = {}

  Object.entries(payload as Record<string, CountyMetadataRecord>).forEach(
    ([fallbackCountyId, county]) => {
      if (!county || typeof county !== 'object') {
        return
      }

      const countyId = normalizeCountyId(
        typeof county.id === 'string' ? county.id : fallbackCountyId,
      )
      if (!countyId) {
        return
      }

      const countyName =
        typeof county.displayName === 'string' && county.displayName.trim().length > 0
          ? county.displayName.trim()
          : countyId
      const prosperity =
        typeof county.prosperityBase === 'number' &&
        Number.isFinite(county.prosperityBase)
          ? county.prosperityBase
          : 0
      const buildingLevels =
        county.buildings === undefined
          ? createEmptyBuildingLevels()
          : normalizeBuildingLevels(county.buildings)
      if (buildingLevels.FARM < 1) {
        buildingLevels.FARM = 1
      }

      const derivedDefense = getCountyDefenseFromBuildingLevels(buildingLevels)
      const defenseFromPayload =
        typeof county.defense === 'number' && Number.isFinite(county.defense)
          ? Math.max(0, Math.floor(county.defense))
          : 0

      const populationCap = getPopulationCapForFarmLevel(buildingLevels.FARM)
      const estimatedPopulation = Math.round(90 + Math.max(0, prosperity) * 12)
      const populationFromPayload =
        typeof county.population === 'number' && Number.isFinite(county.population)
          ? Math.max(0, Math.floor(county.population))
          : estimatedPopulation

      counties[countyId] = {
        id: countyId,
        name: countyName,
        buildings: buildingLevels,
        defense: Math.max(derivedDefense, defenseFromPayload),
        prosperity,
        roadLevel: 0,
        population: Math.min(populationFromPayload, populationCap),
      }
    },
  )

  return counties
}

const parseStartCharacters = (payload: unknown): StartCharacter[] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rawStarts = (payload as StartsPayload).starts
  if (!Array.isArray(rawStarts)) {
    return []
  }

  const starts: StartCharacter[] = []
  rawStarts.forEach((rawStart) => {
    if (!rawStart || typeof rawStart !== 'object') {
      return
    }

    const start = rawStart as StartCharacterRecord
    if (
      typeof start.id !== 'string' ||
      typeof start.name !== 'string' ||
      typeof start.startCountyId !== 'string'
    ) {
      return
    }

    const startCountyId = normalizeCountyId(start.startCountyId)
    if (!startCountyId) {
      return
    }

    starts.push({
      id: start.id.trim(),
      name: start.name.trim(),
      startCountyId,
    })
  })

  return starts
}

const parseKingdoms = (payload: unknown): KingdomGameState[] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rawKingdoms = (payload as KingdomsPayload).kingdoms
  if (!Array.isArray(rawKingdoms)) {
    return []
  }

  const kingdoms: KingdomGameState[] = []
  rawKingdoms.forEach((rawKingdom, index) => {
    if (!rawKingdom || typeof rawKingdom !== 'object') {
      return
    }

    const kingdom = rawKingdom as KingdomRecord
    if (typeof kingdom.id !== 'string' || typeof kingdom.name !== 'string') {
      return
    }

    const countyIds = Array.isArray(kingdom.countyIds)
      ? kingdom.countyIds
          .filter((countyId): countyId is string => typeof countyId === 'string')
          .map((countyId) => normalizeCountyId(countyId))
          .filter((countyId) => countyId.length > 0)
      : []

    kingdoms.push({
      id: kingdom.id.trim(),
      name: kingdom.name.trim(),
      color: KINGDOM_COLORS[index % KINGDOM_COLORS.length],
      countyIds,
    })
  })

  return kingdoms
}

export const createInitialGameState = async (): Promise<GameState> => {
  const toAssetUrl = assetUrl(import.meta.env.BASE_URL)
  const [countyMetadata, startsPayload, kingdomsPayload] = await Promise.all([
    fetchJson<unknown>(toAssetUrl(COUNTY_METADATA_PATH)),
    fetchJson<unknown>(toAssetUrl(STARTS_PATH)),
    fetchJson<unknown>(toAssetUrl(KINGDOMS_PATH)),
  ])
  const kingdoms = parseKingdoms(kingdomsPayload)
  const resourcesByKingdomId: Record<string, ResourceStockpile> = {}
  kingdoms.forEach((kingdom) => {
    resourcesByKingdomId[kingdom.id] = createStartingResources()
  })

  return {
    gamePhase: 'setup',
    turnNumber: 1,
    selectedCountyId: null,
    selectedCharacterId: null,
    startingCountyId: null,
    playerFactionId: null,
    playerFactionName: null,
    playerFactionColor: null,
    ownedCountyIds: [],
    resourcesByKingdomId,
    buildQueueByCountyId: {},
    globalBuildQueue: createEmptyCountyBuildQueue(),
    warehouseLevel: 1,
    lastTurnReport: null,
    fogOfWarEnabled: true,
    superhighwaysEnabled: false,
    discoveredCountyIds: [],
    availableCharacters: parseStartCharacters(startsPayload),
    kingdoms,
    counties: parseCountyState(countyMetadata),
    pendingOrders: [],
  }
}
