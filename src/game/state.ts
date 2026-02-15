import type { MacroOrder } from './orders'

export type GamePhase = 'setup' | 'playing'

export interface CountyGameState {
  id: string
  name: string
  buildings: string[]
  prosperity: number
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

export interface GameState {
  gamePhase: GamePhase
  turnNumber: number
  selectedCountyId: string | null
  selectedCharacterId: string | null
  startingCountyId: string | null
  playerFactionId: string | null
  playerFactionName: string | null
  playerFactionColor: string | null
  playerFactionCountyIds: string[]
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

const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

export const normalizeCountyId = (countyId: string | null | undefined): string =>
  countyId?.trim().toUpperCase() ?? ''

export const assetUrl =
  (baseUrl: string) =>
  (path: string): string =>
    `${normalizeBaseUrl(baseUrl)}${path.replace(/^\/+/, '')}`

const fetchJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

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

      counties[countyId] = {
        id: countyId,
        name: countyName,
        buildings: [],
        prosperity,
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

  return {
    gamePhase: 'setup',
    turnNumber: 1,
    selectedCountyId: null,
    selectedCharacterId: null,
    startingCountyId: null,
    playerFactionId: null,
    playerFactionName: null,
    playerFactionColor: null,
    playerFactionCountyIds: [],
    availableCharacters: parseStartCharacters(startsPayload),
    kingdoms: parseKingdoms(kingdomsPayload),
    counties: parseCountyState(countyMetadata),
    pendingOrders: [],
  }
}
