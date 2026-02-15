import type { MacroOrder } from './orders'

export interface CountyGameState {
  id: string
  name: string
  buildings: string[]
  prosperity: number
}

export interface GameState {
  turnNumber: number
  selectedCountyId: string | null
  counties: Record<string, CountyGameState>
  pendingOrders: MacroOrder[]
}

const COUNTY_METADATA_PATH = 'data/county_metadata.json'

interface CountyMetadataRecord {
  id?: unknown
  displayName?: unknown
  prosperityBase?: unknown
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

export const createInitialGameState = async (): Promise<GameState> => {
  const toAssetUrl = assetUrl(import.meta.env.BASE_URL)
  const countyMetadata = await fetchJson<unknown>(
    toAssetUrl(COUNTY_METADATA_PATH),
  )

  return {
    turnNumber: 1,
    selectedCountyId: null,
    counties: parseCountyState(countyMetadata),
    pendingOrders: [],
  }
}
