import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client'
import {
  CanvasRoadLayer,
  type RoadRenderModel,
} from './map/CanvasRoadLayer'
import { Modal } from './components/Modal'
import './App.css'

const normalizeBasePath = (basePath: string): string =>
  basePath.endsWith('/') ? basePath : `${basePath}/`

const DATA_BASE_PATH = `${normalizeBasePath(import.meta.env.BASE_URL)}data`
const dataPath = (fileName: string) => `${DATA_BASE_PATH}/${fileName}`

const TOPOLOGY_PATH = dataPath('counties_gb_s05.topo.json')
const KINGDOMS_PATH = dataPath('kingdoms.json')
const COUNTY_METADATA_PATH = dataPath('county_metadata.json')
const DEEPWATER_PORTS_PATH = dataPath('deepwater_ports.json')
const STARTS_PATH = dataPath('starts.json')
const START_STORAGE_KEY = 'britannia:start-id'
const COUNTY_DEVELOPMENT_STORAGE_KEY = 'britannia:county-development-v1'
const SUPERHIGHWAYS_STORAGE_KEY = 'britannia:superhighways-enabled'

const MIN_ZOOM = 1
const MAX_ZOOM = 6
const WILDERNESS_COLOR = '#56604d'
const EXPLORED_COUNTY_COLOR = '#566068'
const PLAYER_COUNTY_COLOR = '#f3c94b'
const DEFAULT_PROSPERITY_BASE = 20
const DEFAULT_INDUSTRIALIZATION_BASE = 1
const DEEPWATER_PROSPERITY_BASE = 35
const DEEPWATER_INDUSTRIALIZATION_BASE = 4
const START_PROSPERITY_BASE = 25
const START_INDUSTRIALIZATION_BASE = 2
const PORT_PROSPERITY_BONUS = 10
const PROSPERITY_BASE_MIN = 10
const PROSPERITY_BASE_MAX = 60
const INDUSTRIALIZATION_BASE_MIN = 0
const INDUSTRIALIZATION_BASE_MAX = 20
const ROAD_LEVEL_MIN = 0
const ROAD_LEVEL_MAX = 5
const ROAD_LEVEL_LABELS = [
  'Track',
  'Packed Dirt',
  'Gravel',
  'Paved Stone',
  'Engineered Causeway',
  'Imperial Artery',
] as const
const ROAD_BONUS_BY_LEVEL = [0, 4, 9, 15, 22, 30] as const
const START_COUNTY_OVERRIDE_IDS = new Set(['STL', 'CRN', 'SMS', 'OXD'])
const DEBUG_LAYOUT = false
const KINGDOM_COLORS = [
  '#8f6f3f',
  '#4f7d68',
  '#37608c',
  '#7e4e8c',
  '#3f7f8b',
  '#8a5f53',
  '#5f6c93',
  '#88713f',
  '#507a4f',
  '#7a5c36',
]

interface CountyTopologyProperties {
  NAME?: string
  COUNTY?: string
  ABBR?: string
  HCS_CODE?: string
}

interface TopologyGeometry {
  arcs?: unknown
  properties?: CountyTopologyProperties | null
}

interface TopologyObject {
  type: string
  geometries?: TopologyGeometry[]
}

interface TopologyTransform {
  scale: [number, number]
  translate: [number, number]
}

interface TopologyData {
  type: 'Topology'
  transform?: TopologyTransform
  arcs?: number[][][]
  objects: Record<string, TopologyObject>
}

interface Kingdom {
  id: string
  name: string
  tier: string
  capitalCountyId: string
  countyIds: string[]
  deepwaterPortCountyId?: string
}

interface KingdomsPayload {
  kingdoms: Kingdom[]
  unclaimedCountyIds: string[]
}

interface CountyMetadata {
  id: string
  countyShort: string
  displayName: string
  prosperity: number
  industrialization: number
  prosperityBase: number
  industrializationBase: number
  roadLevel: number
  prosperityEffective: number
  deepwaterPort: boolean
}

type CountyMetadataById = Record<string, CountyMetadata>

interface CountyDevelopmentSnapshot {
  prosperityBase?: number
  industrializationBase?: number
  roadLevel?: number
}

type CountyDevelopmentSnapshotById = Record<string, CountyDevelopmentSnapshot>

interface DeepwaterPortsPayload {
  deepwaterPorts: string[]
}

interface StartCharacter {
  id: string
  name: string
  startCountyId: string
  perk?: {
    type: string
    value: number
  }
}

interface StartsPayload {
  starts: StartCharacter[]
}

interface CountyDrawModel {
  id: string
  name: string
  d: string
  centroid: [number, number]
  owner: Kingdom | null
  metadata: CountyMetadata | null
}

interface CountyFeature {
  type: string
  properties?: CountyTopologyProperties | null
  geometry?: unknown
}

interface CountyFeatureCollection {
  type: string
  features: CountyFeature[]
}

interface BorderGeometry {
  type: string
}

interface TooltipState {
  countyId: string
  x: number
  y: number
}

interface BuildQueueEntry {
  id: number
  countyId: string
  countyName: string
  action: 'Road I' | 'Market I'
  createdAt: string
}

interface CountyAdjacencyModel {
  adjacencyByCounty: Record<string, string[]>
  gatePointByPair: Record<string, [number, number]>
}

interface CountyRoadEdge {
  id: string
  countyAId: string
  countyBId: string
  gatePoint: [number, number]
}

type FogTier = 'visible' | 'explored' | 'unseen'

interface FogState {
  startCountyId: string | null
  visibleCountyIds: Set<string>
  exploredCountyIds: Set<string>
  discoveredKingdomIds: Set<string>
}

type RevealEventType = 'SCOUT' | 'ATTACK_CAPTURE' | 'TRADE_LINK'

interface RevealEvent {
  type: RevealEventType
  countyId: string
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

type ResourceKey = 'gold' | 'food' | 'wood' | 'stone' | 'iron' | 'research'

interface ResourceStat {
  key: ResourceKey
  label: string
  value: string
  tooltip: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const clampInteger = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max))

const normalizeCountyId = (countyId: string | null | undefined): string =>
  countyId?.trim().toUpperCase() ?? ''

const getRoadBonus = (roadLevel: number): number => {
  const clampedRoadLevel = clampInteger(roadLevel, ROAD_LEVEL_MIN, ROAD_LEVEL_MAX)
  return ROAD_BONUS_BY_LEVEL[clampedRoadLevel]
}

const getRoadLevelLabel = (roadLevel: number): string => {
  const clampedRoadLevel = clampInteger(roadLevel, ROAD_LEVEL_MIN, ROAD_LEVEL_MAX)
  return ROAD_LEVEL_LABELS[clampedRoadLevel]
}

const calculateProsperityEffective = (
  prosperityBase: number,
  roadLevel: number,
  deepwaterPort: boolean,
): number => {
  const normalizedProsperityBase = clampInteger(
    prosperityBase,
    PROSPERITY_BASE_MIN,
    100,
  )
  const roadBonus = getRoadBonus(roadLevel)
  const portBonus = deepwaterPort ? PORT_PROSPERITY_BONUS : 0
  return clampInteger(normalizedProsperityBase + roadBonus + portBonus, 0, 100)
}

const loadCountyDevelopmentSnapshot = (): CountyDevelopmentSnapshotById => {
  try {
    const rawValue = localStorage.getItem(COUNTY_DEVELOPMENT_STORAGE_KEY)
    if (!rawValue) {
      return {}
    }

    const parsed = JSON.parse(rawValue) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    const snapshotById: CountyDevelopmentSnapshotById = {}
    Object.entries(parsed as Record<string, unknown>).forEach(
      ([countyId, snapshot]) => {
        if (!snapshot || typeof snapshot !== 'object') {
          return
        }
        const normalizedCountyId = normalizeCountyId(countyId)
        if (!normalizedCountyId) {
          return
        }
        const value = snapshot as Record<string, unknown>
        snapshotById[normalizedCountyId] = {
          prosperityBase:
            typeof value.prosperityBase === 'number' ? value.prosperityBase : undefined,
          industrializationBase:
            typeof value.industrializationBase === 'number'
              ? value.industrializationBase
              : undefined,
          roadLevel: typeof value.roadLevel === 'number' ? value.roadLevel : undefined,
        }
      },
    )

    return snapshotById
  } catch {
    return {}
  }
}

const buildInitializedCountyMetadata = (
  countyMetadataById: CountyMetadataById,
  deepwaterPortIds: string[],
  developmentSnapshotById: CountyDevelopmentSnapshotById,
): CountyMetadataById => {
  const deepwaterPortSet = new Set<string>(
    deepwaterPortIds.map((countyId) => normalizeCountyId(countyId)),
  )

  const initializedMetadata: CountyMetadataById = {}
  Object.values(countyMetadataById).forEach((county) => {
    const countyId = normalizeCountyId(county.id)
    if (!countyId) {
      return
    }

    const hasDeepwaterPort = county.deepwaterPort || deepwaterPortSet.has(countyId)
    const defaultProsperityBase = hasDeepwaterPort
      ? DEEPWATER_PROSPERITY_BASE
      : DEFAULT_PROSPERITY_BASE
    const defaultIndustrializationBase = hasDeepwaterPort
      ? DEEPWATER_INDUSTRIALIZATION_BASE
      : DEFAULT_INDUSTRIALIZATION_BASE
    const startOverride = START_COUNTY_OVERRIDE_IDS.has(countyId)
    const initialProsperityBase = startOverride
      ? START_PROSPERITY_BASE
      : defaultProsperityBase
    const initialIndustrializationBase = startOverride
      ? START_INDUSTRIALIZATION_BASE
      : defaultIndustrializationBase

    const snapshot = developmentSnapshotById[countyId]
    const prosperityBase = clampInteger(
      snapshot?.prosperityBase ?? initialProsperityBase,
      PROSPERITY_BASE_MIN,
      PROSPERITY_BASE_MAX,
    )
    const industrializationBase = clampInteger(
      snapshot?.industrializationBase ?? initialIndustrializationBase,
      INDUSTRIALIZATION_BASE_MIN,
      INDUSTRIALIZATION_BASE_MAX,
    )
    const roadLevel = clampInteger(
      snapshot?.roadLevel ?? ROAD_LEVEL_MIN,
      ROAD_LEVEL_MIN,
      ROAD_LEVEL_MAX,
    )
    const prosperityEffective = calculateProsperityEffective(
      prosperityBase,
      roadLevel,
      hasDeepwaterPort,
    )

    initializedMetadata[countyId] = {
      ...county,
      id: countyId,
      deepwaterPort: hasDeepwaterPort,
      prosperityBase,
      industrializationBase,
      roadLevel,
      prosperityEffective,
      prosperity: prosperityBase,
      industrialization: industrializationBase,
    }
  })

  return initializedMetadata
}

const blendHexColor = (
  sourceHexColor: string,
  targetHexColor: string,
  amount: number,
): string => {
  const parseHex = (hexColor: string) => {
    const normalized = hexColor.replace('#', '')
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return null
    }
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
    }
  }

  const source = parseHex(sourceHexColor)
  const target = parseHex(targetHexColor)
  if (!source || !target) {
    return sourceHexColor
  }

  const ratio = clamp(amount, 0, 1)
  const mixed = {
    r: Math.round(source.r + (target.r - source.r) * ratio),
    g: Math.round(source.g + (target.g - source.g) * ratio),
    b: Math.round(source.b + (target.b - source.b) * ratio),
  }

  return `#${[mixed.r, mixed.g, mixed.b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

const getCountyId = (
  properties: CountyTopologyProperties | null | undefined,
): string => {
  const countyCode = properties?.HCS_CODE ?? ''
  return countyCode.trim().toUpperCase()
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error while loading map data.'
}

const collectArcIndices = (value: unknown, output: number[]) => {
  if (!Array.isArray(value)) {
    return
  }

  if (value.length > 0 && typeof value[0] === 'number') {
    for (const arcIndex of value) {
      if (typeof arcIndex === 'number') {
        // TopoJSON stores reversed arcs as bitwise-not indexes.
        const normalizedArcIndex = arcIndex >= 0 ? arcIndex : ~arcIndex
        output.push(normalizedArcIndex)
      }
    }
    return
  }

  for (const child of value) {
    collectArcIndices(child, output)
  }
}

const getCountyPairKey = (countyAId: string, countyBId: string): string =>
  countyAId < countyBId
    ? `${countyAId}|${countyBId}`
    : `${countyBId}|${countyAId}`

const getPolylineLength = (points: [number, number][]): number => {
  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    length += Math.hypot(x1 - x0, y1 - y0)
  }
  return length
}

const getPolylineMidpoint = (points: [number, number][]): [number, number] | null => {
  if (points.length < 2) {
    return null
  }

  const totalLength = getPolylineLength(points)
  if (totalLength <= 0) {
    return points[0] ?? null
  }

  const targetLength = totalLength / 2
  let traversedLength = 0

  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const segmentLength = Math.hypot(x1 - x0, y1 - y0)
    if (segmentLength <= 0) {
      continue
    }

    if (traversedLength + segmentLength >= targetLength) {
      const remainingLength = targetLength - traversedLength
      const ratio = remainingLength / segmentLength
      return [x0 + (x1 - x0) * ratio, y0 + (y1 - y0) * ratio]
    }

    traversedLength += segmentLength
  }

  return points[points.length - 1] ?? null
}

const decodeTopologyArcs = (topologyData: TopologyData): [number, number][][] => {
  const rawArcs = topologyData.arcs ?? []
  const transform = topologyData.transform

  return rawArcs.map((rawArc) => {
    let currentX = 0
    let currentY = 0
    const decodedArc: [number, number][] = []

    rawArc.forEach((position) => {
      if (!Array.isArray(position) || position.length < 2) {
        return
      }
      const deltaX = Number(position[0])
      const deltaY = Number(position[1])
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
        return
      }

      currentX += deltaX
      currentY += deltaY

      const longitude = transform
        ? currentX * transform.scale[0] + transform.translate[0]
        : currentX
      const latitude = transform
        ? currentY * transform.scale[1] + transform.translate[1]
        : currentY
      decodedArc.push([longitude, latitude])
    })

    return decodedArc
  })
}

const buildCountyAdjacencyModel = (
  topologyData: TopologyData,
  object: TopologyObject,
): CountyAdjacencyModel => {
  const geometries = object.geometries ?? []
  const arcOwners = new Map<number, Set<string>>()
  const decodedArcs = decodeTopologyArcs(topologyData)

  for (const geometry of geometries) {
    const countyId = getCountyId(geometry.properties)
    if (!countyId) {
      continue
    }

    const arcIndices: number[] = []
    collectArcIndices(geometry.arcs, arcIndices)
    const uniqueIndices = new Set(arcIndices)

    uniqueIndices.forEach((arcIndex) => {
      const owners = arcOwners.get(arcIndex) ?? new Set<string>()
      owners.add(countyId)
      arcOwners.set(arcIndex, owners)
    })
  }

  const adjacency = new Map<string, Set<string>>()
  arcOwners.forEach((owners) => {
    const ids = [...owners]
    for (let i = 0; i < ids.length; i += 1) {
      const source = ids[i]
      const linked = adjacency.get(source) ?? new Set<string>()
      for (let j = 0; j < ids.length; j += 1) {
        if (i !== j) {
          linked.add(ids[j])
        }
      }
      adjacency.set(source, linked)
    }
  })

  const result: Record<string, string[]> = {}
  adjacency.forEach((neighbors, countyId) => {
    result[countyId] = [...neighbors].sort()
  })

  const gateAggregateByPair = new Map<
    string,
    { sumX: number; sumY: number; weight: number }
  >()
  arcOwners.forEach((owners, arcIndex) => {
    if (owners.size < 2) {
      return
    }

    const arcPoints = decodedArcs[arcIndex] ?? []
    const midpoint = getPolylineMidpoint(arcPoints)
    const weight = getPolylineLength(arcPoints)
    if (!midpoint || weight <= 0) {
      return
    }

    const ownerIds = [...owners].sort()
    for (let i = 0; i < ownerIds.length; i += 1) {
      for (let j = i + 1; j < ownerIds.length; j += 1) {
        const pairKey = getCountyPairKey(ownerIds[i], ownerIds[j])
        const current = gateAggregateByPair.get(pairKey) ?? {
          sumX: 0,
          sumY: 0,
          weight: 0,
        }

        current.sumX += midpoint[0] * weight
        current.sumY += midpoint[1] * weight
        current.weight += weight
        gateAggregateByPair.set(pairKey, current)
      }
    }
  })

  const gatePointByPair: Record<string, [number, number]> = {}
  gateAggregateByPair.forEach((aggregate, pairKey) => {
    if (aggregate.weight <= 0) {
      return
    }
    gatePointByPair[pairKey] = [
      aggregate.sumX / aggregate.weight,
      aggregate.sumY / aggregate.weight,
    ]
  })

  return {
    adjacencyByCounty: result,
    gatePointByPair,
  }
}

const formatPerkDescription = (
  perk: StartCharacter['perk'] | undefined,
): string => {
  if (!perk) {
    return 'No special perk'
  }

  if (perk.type === 'wall_defense_per_level') {
    return `+${(perk.value * 100).toFixed(1)}% defense per wall level`
  }
  if (perk.type === 'mining_productivity_mult') {
    return `+${((perk.value - 1) * 100).toFixed(0)}% mining productivity`
  }
  if (perk.type === 'infantry_attack_mult') {
    return `+${((perk.value - 1) * 100).toFixed(0)}% infantry attack`
  }
  if (perk.type === 'research_rate_mult') {
    return `+${((perk.value - 1) * 100).toFixed(0)}% research rate`
  }

  return `${perk.type}: ${perk.value}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`)
  }
  return (await response.json()) as T
}

function ResourceIcon({ kind }: { kind: ResourceKey }) {
  if (kind === 'gold') {
    return (
      <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="7.2" />
        <path d="M 10 5.5 L 11.5 8.6 L 14.8 9 L 12.4 11.2 L 13.1 14.4 L 10 12.8 L 6.9 14.4 L 7.6 11.2 L 5.2 9 L 8.5 8.6 Z" />
      </svg>
    )
  }

  if (kind === 'food') {
    return (
      <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
        <path d="M 6 4.5 C 8.8 6.4 9 10.7 6.1 15.5 M 10 4.2 C 12.4 6.3 12.5 10.2 10 15.5 M 14 4.8 C 15.5 6.4 15.7 9.5 13.9 14.8" />
      </svg>
    )
  }

  if (kind === 'wood') {
    return (
      <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
        <path d="M 10 4 L 6 9 H 8.2 L 5.4 13 H 8.3 L 6.9 16 H 13.1 L 11.7 13 H 14.6 L 11.8 9 H 14 Z" />
      </svg>
    )
  }

  if (kind === 'stone') {
    return (
      <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
        <path d="M 3.8 12.2 L 7.2 6.5 H 12.8 L 16.2 12.2 L 12.8 15.8 H 7.2 Z" />
      </svg>
    )
  }

  if (kind === 'iron') {
    return (
      <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
        <path d="M 5 6 H 12.7 V 9.4 H 7.4 C 6.1 9.4 5 10.5 5 11.8 V 14 H 3.6 V 11.6 C 3.6 8.5 5.9 6 9.1 6 Z" />
        <path d="M 12.7 6 L 16.4 9.4 L 12.7 12.8 Z" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" className="resource-icon" viewBox="0 0 20 20">
      <path d="M 4.6 4.4 H 14.6 V 6.2 H 6.4 V 13.8 H 14.6 V 15.6 H 4.6 Z" />
      <path d="M 10 8.4 L 16 10 L 10 11.6 Z" />
    </svg>
  )
}

function App() {
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const settingsGearButtonRef = useRef<HTMLButtonElement | null>(null)
  const settingsInitialFocusRef = useRef<HTMLButtonElement | null>(null)
  const previousSettingsOpenRef = useRef(false)
  const dragStateRef = useRef<DragState | null>(null)
  const dragMovedRef = useRef(false)

  const [countyFeatures, setCountyFeatures] = useState<
    CountyFeatureCollection | null
  >(null)
  const [borderMesh, setBorderMesh] = useState<BorderGeometry | null>(null)
  const [kingdoms, setKingdoms] = useState<Kingdom[]>([])
  const [unclaimedCountyIds, setUnclaimedCountyIds] = useState<string[]>([])
  const [countyMetadataById, setCountyMetadataById] =
    useState<CountyMetadataById>({})
  const [deepwaterPortIds, setDeepwaterPortIds] = useState<string[]>([])
  const [countyNeighborIdsByCounty, setCountyNeighborIdsByCounty] = useState<
    Record<string, string[]>
  >({})
  const [countyGatePointByPair, setCountyGatePointByPair] = useState<
    Record<string, [number, number]>
  >({})
  const [starts, setStarts] = useState<StartCharacter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [headerHeightPx, setHeaderHeightPx] = useState(84)
  const [viewport, setViewport] = useState({ width: 1000, height: 640 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)

  const [selectedCountyId, setSelectedCountyId] = useState<string | null>(null)
  const [hoveredCountyId, setHoveredCountyId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [buildQueue, setBuildQueue] = useState<BuildQueueEntry[]>([])
  const [viewCountyMessage, setViewCountyMessage] = useState<string | null>(
    null,
  )
  const [fogEnabled, setFogEnabled] = useState(true)
  const [roadsEnabled, setRoadsEnabled] = useState(true)
  const [superhighwaysEnabled, setSuperhighwaysEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return localStorage.getItem(SUPERHIGHWAYS_STORAGE_KEY) === '1'
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isStartScreenOpen, setIsStartScreenOpen] = useState(true)
  const [selectedStartId, setSelectedStartId] = useState<string | null>(null)
  const [playerStartId, setPlayerStartId] = useState<string | null>(null)
  const [playerStartCountyId, setPlayerStartCountyId] = useState<string | null>(
    null,
  )
  const [playerCountyIds, setPlayerCountyIds] = useState<string[]>([])
  const [fogState, setFogState] = useState<FogState>({
    startCountyId: null,
    visibleCountyIds: new Set<string>(),
    exploredCountyIds: new Set<string>(),
    discoveredKingdomIds: new Set<string>(),
  })
  const [isFogDebugOpen, setIsFogDebugOpen] = useState(false)
  const fogIdBase = useId().replace(/:/g, '')
  const fogMaskId = `${fogIdBase}-mask`
  const fogRevealFilterId = `${fogIdBase}-reveal-blur`
  const fogRevealHaloFilterId = `${fogIdBase}-reveal-halo`
  const fogTextureFilterId = `${fogIdBase}-texture`
  const settingsTitleId = `${fogIdBase}-settings-title`

  useEffect(() => {
    const body = document.body
    const html = document.documentElement

    const previousBodyOverflow = body.style.overflow
    const previousBodyOverscroll = body.style.overscrollBehavior
    const previousHtmlOverflow = html.style.overflow
    const previousHtmlOverscroll = html.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    return () => {
      body.style.overflow = previousBodyOverflow
      body.style.overscrollBehavior = previousBodyOverscroll
      html.style.overflow = previousHtmlOverflow
      html.style.overscrollBehavior = previousHtmlOverscroll
    }
  }, [])

  useEffect(() => {
    const body = document.body
    const previousUserSelect = body.style.userSelect
    if (isDragging) {
      body.style.userSelect = 'none'
    }

    return () => {
      body.style.userSelect = previousUserSelect
    }
  }, [isDragging])

  useEffect(() => {
    if (previousSettingsOpenRef.current && !settingsOpen) {
      settingsGearButtonRef.current?.focus()
    }
    previousSettingsOpenRef.current = settingsOpen
  }, [settingsOpen])

  useEffect(() => {
    const headerElement = headerRef.current
    if (!headerElement) {
      return
    }

    const updateHeaderHeight = () => {
      const measuredHeight = headerElement.getBoundingClientRect().height
      setHeaderHeightPx(Math.max(56, Math.ceil(measuredHeight)))
    }

    updateHeaderHeight()
    const observer = new ResizeObserver(() => updateHeaderHeight())

    observer.observe(headerElement)
    return () => observer.disconnect()
  }, [])

  const clampPan = useCallback(
    (x: number, y: number, scale: number) => {
      const panPadding = 110
      const minX = viewport.width - viewport.width * scale - panPadding
      const maxX = panPadding
      const minY = viewport.height - viewport.height * scale - panPadding
      const maxY = panPadding

      return {
        x: clamp(x, minX, maxX),
        y: clamp(y, minY, maxY),
      }
    },
    [viewport.height, viewport.width],
  )

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const [
          topologyData,
          kingdomsPayload,
          countyMetadataPayload,
          deepwaterPortsPayload,
          startsPayload,
        ] = await Promise.all([
          fetchJson<TopologyData>(TOPOLOGY_PATH),
          fetchJson<KingdomsPayload>(KINGDOMS_PATH),
          fetchJson<CountyMetadataById>(COUNTY_METADATA_PATH),
          fetchJson<DeepwaterPortsPayload>(DEEPWATER_PORTS_PATH),
          fetchJson<StartsPayload>(STARTS_PATH),
        ])

        const objectName = Object.keys(topologyData.objects)[0]
        if (!objectName) {
          throw new Error('No TopoJSON object was found in map data.')
        }

        const topologyObject = topologyData.objects[objectName]
        const features = topoFeature(
          topologyData,
          topologyObject,
        ) as CountyFeatureCollection
        const adjacencyModel = buildCountyAdjacencyModel(
          topologyData,
          topologyObject,
        )
        const mesh = topoMesh(
          topologyData,
          topologyObject,
          (a: unknown, b: unknown) => a !== b,
        ) as BorderGeometry

        if (cancelled) {
          return
        }

        const initialCountyMetadata = buildInitializedCountyMetadata(
          countyMetadataPayload,
          deepwaterPortsPayload.deepwaterPorts ?? [],
          loadCountyDevelopmentSnapshot(),
        )

        setCountyFeatures(features)
        setBorderMesh(mesh)
        setKingdoms(kingdomsPayload.kingdoms ?? [])
        setUnclaimedCountyIds(kingdomsPayload.unclaimedCountyIds ?? [])
        setCountyMetadataById(initialCountyMetadata)
        setDeepwaterPortIds(deepwaterPortsPayload.deepwaterPorts ?? [])
        setCountyNeighborIdsByCounty(adjacencyModel.adjacencyByCounty)
        setCountyGatePointByPair(adjacencyModel.gatePointByPair)
        setStarts(startsPayload.starts ?? [])
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const container = mapViewportRef.current
    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) {
        return
      }

      setViewport({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(420, Math.round(rect.height)),
      })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setTransform((current) => {
      const clamped = clampPan(current.x, current.y, current.scale)
      if (clamped.x === current.x && clamped.y === current.y) {
        return current
      }
      return { ...current, ...clamped }
    })
  }, [clampPan, viewport.height, viewport.width])

  const ownerByCountyId = useMemo(() => {
    const map = new Map<string, Kingdom>()
    for (const kingdom of kingdoms) {
      for (const countyId of kingdom.countyIds) {
        const normalizedCountyId = normalizeCountyId(countyId)
        if (!normalizedCountyId) {
          continue
        }
        map.set(normalizedCountyId, kingdom)
      }
    }
    return map
  }, [kingdoms])

  const kingdomColorById = useMemo(() => {
    const map = new Map<string, string>()
    kingdoms.forEach((kingdom, index) => {
      map.set(kingdom.id, KINGDOM_COLORS[index % KINGDOM_COLORS.length])
    })
    return map
  }, [kingdoms])

  const unclaimedSet = useMemo(
    () => new Set(unclaimedCountyIds.map((countyId) => countyId.toUpperCase())),
    [unclaimedCountyIds],
  )

  const deepwaterPortSet = useMemo(() => {
    const ports = new Set(
      deepwaterPortIds.map((countyId) => countyId.trim().toUpperCase()),
    )
    Object.values(countyMetadataById).forEach((county) => {
      if (county.deepwaterPort) {
        ports.add(county.id.trim().toUpperCase())
      }
    })
    return ports
  }, [countyMetadataById, deepwaterPortIds])

  const startsByCountyId = useMemo(() => {
    const map = new Map<string, StartCharacter[]>()
    for (const start of starts) {
      const countyId = start.startCountyId.trim().toUpperCase()
      const list = map.get(countyId) ?? []
      list.push(start)
      map.set(countyId, list)
    }
    return map
  }, [starts])

  useEffect(() => {
    if (starts.length === 0) {
      return
    }

    const storedStartId = localStorage.getItem(START_STORAGE_KEY)
    const fallbackId = starts[0]?.id ?? null
    const initialStartId =
      storedStartId && starts.some((start) => start.id === storedStartId)
        ? storedStartId
        : fallbackId

    if (!initialStartId) {
      return
    }

    setSelectedStartId((current) => current ?? initialStartId)
    setPlayerStartId((current) => current ?? initialStartId)
    const initialStart = starts.find((start) => start.id === initialStartId)
    const initialCountyId = normalizeCountyId(initialStart?.startCountyId)

    setPlayerStartCountyId((current) => current ?? initialCountyId ?? null)
    setPlayerCountyIds((current) =>
      current.length > 0 || !initialCountyId ? current : [initialCountyId],
    )
  }, [starts])

  const projectedMap = useMemo(() => {
    if (!countyFeatures) {
      return null
    }

    const projection = geoMercator()
    projection.fitExtent(
      [
        [30, 24],
        [viewport.width - 30, viewport.height - 24],
      ],
      countyFeatures,
    )

    const pathGenerator = geoPath(projection)
    const projectPoint = (point: [number, number]): [number, number] | null => {
      const project = projection as unknown as (
        input: [number, number],
      ) => [number, number] | null
      const projected = project(point)
      if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) {
        return null
      }
      return [projected[0], projected[1]]
    }
    const counties: CountyDrawModel[] = countyFeatures.features
      .map((featureItem: CountyFeature) => {
        const countyId = getCountyId(featureItem.properties)
        const countyMetadata = countyMetadataById[countyId] ?? null
        const ownerKingdom = ownerByCountyId.get(countyId) ?? null
        const countyName =
          countyMetadata?.displayName ?? featureItem.properties?.NAME ?? countyId
        const pathData = pathGenerator(featureItem) ?? ''
        const centroid = pathGenerator.centroid(featureItem) as [number, number]

        return {
          id: countyId,
          name: countyName,
          d: pathData,
          centroid,
          owner: ownerKingdom,
          metadata: countyMetadata,
        }
      })
      .filter(
        (county: CountyDrawModel) =>
          county.id.length > 0 &&
          county.d.length > 0 &&
          Number.isFinite(county.centroid[0]) &&
          Number.isFinite(county.centroid[1]),
      )

    const borderPath = borderMesh ? pathGenerator(borderMesh) ?? '' : ''

    return { counties, borderPath, projectPoint }
  }, [
    borderMesh,
    countyFeatures,
    countyMetadataById,
    ownerByCountyId,
    viewport.height,
    viewport.width,
  ])

  useEffect(() => {
    if (!projectedMap || projectedMap.counties.length === 0) {
      return
    }
    setSelectedCountyId((current) => current ?? projectedMap.counties[0].id)
  }, [projectedMap])

  const selectedCounty = useMemo(
    () =>
      projectedMap?.counties.find((county) => county.id === selectedCountyId) ??
      null,
    [projectedMap, selectedCountyId],
  )

  const persistCountyDevelopment = useCallback(
    (metadataByCountyId: CountyMetadataById) => {
      const snapshotById: CountyDevelopmentSnapshotById = {}
      Object.values(metadataByCountyId).forEach((county) => {
        snapshotById[county.id] = {
          prosperityBase: county.prosperityBase,
          industrializationBase: county.industrializationBase,
          roadLevel: county.roadLevel,
        }
      })

      localStorage.setItem(
        COUNTY_DEVELOPMENT_STORAGE_KEY,
        JSON.stringify(snapshotById),
      )
    },
    [],
  )

  const selectedCountyQueue = useMemo(
    () => buildQueue.filter((entry) => entry.countyId === selectedCountyId),
    [buildQueue, selectedCountyId],
  )

  const selectedCountyStarts = useMemo(
    () =>
      selectedCountyId ? (startsByCountyId.get(selectedCountyId) ?? []) : [],
    [selectedCountyId, startsByCountyId],
  )

  const selectedStartCharacter = useMemo(
    () => starts.find((start) => start.id === selectedStartId) ?? null,
    [selectedStartId, starts],
  )

  const activeCharacter = useMemo(
    () =>
      starts.find((start) => start.id === playerStartId) ??
      selectedStartCharacter ??
      starts[0] ??
      null,
    [playerStartId, selectedStartCharacter, starts],
  )

  const countyRoadEdges = useMemo<CountyRoadEdge[]>(() => {
    const edges: CountyRoadEdge[] = []

    Object.entries(countyNeighborIdsByCounty).forEach(([countyId, neighbors]) => {
      neighbors.forEach((neighborId) => {
        if (countyId >= neighborId) {
          return
        }
        const pairKey = getCountyPairKey(countyId, neighborId)
        const gatePoint = countyGatePointByPair[pairKey]
        if (!gatePoint) {
          return
        }
        edges.push({
          id: pairKey,
          countyAId: countyId,
          countyBId: neighborId,
          gatePoint,
        })
      })
    })

    edges.sort((left, right) => left.id.localeCompare(right.id))
    return edges
  }, [countyGatePointByPair, countyNeighborIdsByCounty])

  const resourceStats = useMemo<ResourceStat[]>(
    () => [
      {
        key: 'gold',
        label: 'Gold',
        value: '1,250',
        tooltip: 'Wealth in the royal treasury.',
      },
      {
        key: 'food',
        label: 'Food',
        value: '930',
        tooltip: 'Stored grain and provisions for your realm.',
      },
      {
        key: 'wood',
        label: 'Wood',
        value: '610',
        tooltip: 'Timber available for construction.',
      },
      {
        key: 'stone',
        label: 'Stone',
        value: '420',
        tooltip: 'Masonry stock for fortifications and roads.',
      },
      {
        key: 'iron',
        label: 'Iron',
        value: '175',
        tooltip: 'Refined iron for arms and industry.',
      },
      {
        key: 'research',
        label: 'Research',
        value: '32%',
        tooltip: 'Current progress toward the next shared research tier.',
      },
    ],
    [],
  )

  const playerCountyIdSet = useMemo(() => {
    const ids = new Set<string>()
    playerCountyIds.forEach((countyId) => {
      const normalizedCountyId = normalizeCountyId(countyId)
      if (normalizedCountyId) {
        ids.add(normalizedCountyId)
      }
    })
    if (playerStartCountyId) {
      ids.add(playerStartCountyId)
    }
    return ids
  }, [playerCountyIds, playerStartCountyId])

  const computeDiscoveredKingdomIds = useCallback(
    (visibleIds: Set<string>) => {
      const discovered = new Set<string>()
      visibleIds.forEach((countyId) => {
        if (unclaimedSet.has(countyId)) {
          return
        }
        const owner = ownerByCountyId.get(countyId)
        if (owner) {
          discovered.add(owner.id)
        }
      })
      return discovered
    },
    [ownerByCountyId, unclaimedSet],
  )

  const buildInitialFogState = useCallback(
    (startCountyId: string | null): FogState => {
      const normalizedStartCountyId = normalizeCountyId(startCountyId)
      const visibleCountyIds = new Set<string>()
      const exploredCountyIds = new Set<string>()

      if (normalizedStartCountyId) {
        visibleCountyIds.add(normalizedStartCountyId)
        exploredCountyIds.add(normalizedStartCountyId)
        const neighbors = countyNeighborIdsByCounty[normalizedStartCountyId] ?? []
        neighbors.forEach((neighborId) => {
          const normalizedNeighborId = normalizeCountyId(neighborId)
          if (normalizedNeighborId) {
            exploredCountyIds.add(normalizedNeighborId)
          }
        })
      }

      return {
        startCountyId: normalizedStartCountyId || null,
        visibleCountyIds,
        exploredCountyIds,
        discoveredKingdomIds: computeDiscoveredKingdomIds(visibleCountyIds),
      }
    },
    [countyNeighborIdsByCounty, computeDiscoveredKingdomIds],
  )

  useEffect(() => {
    if (!playerStartCountyId) {
      return
    }
    setFogState(buildInitialFogState(playerStartCountyId))
  }, [buildInitialFogState, playerStartCountyId])

  const applyRevealEvent = useCallback(
    (event: RevealEvent) => {
      const targetCountyId = normalizeCountyId(event.countyId)
      if (!targetCountyId) {
        return
      }

      if (event.type === 'ATTACK_CAPTURE') {
        setPlayerCountyIds((current) =>
          current.includes(targetCountyId) ? current : [...current, targetCountyId],
        )
      }

      setFogState((current) => {
        const visibleCountyIds = new Set(current.visibleCountyIds)
        const exploredCountyIds = new Set(current.exploredCountyIds)

        const revealCountyAndNeighbors = (countyId: string) => {
          visibleCountyIds.add(countyId)
          exploredCountyIds.add(countyId)
          const neighbors = countyNeighborIdsByCounty[countyId] ?? []
          neighbors.forEach((neighborId) => {
            const normalizedNeighborId = normalizeCountyId(neighborId)
            if (normalizedNeighborId) {
              exploredCountyIds.add(normalizedNeighborId)
            }
          })
        }

        if (event.type === 'SCOUT' || event.type === 'ATTACK_CAPTURE') {
          revealCountyAndNeighbors(targetCountyId)
        }

        if (event.type === 'TRADE_LINK') {
          exploredCountyIds.add(targetCountyId)
          const neighbors = countyNeighborIdsByCounty[targetCountyId] ?? []
          neighbors.forEach((neighborId) => {
            const normalizedNeighborId = normalizeCountyId(neighborId)
            if (normalizedNeighborId) {
              exploredCountyIds.add(normalizedNeighborId)
            }
          })
        }

        visibleCountyIds.forEach((countyId) => exploredCountyIds.add(countyId))
        const discoveredKingdomIds =
          computeDiscoveredKingdomIds(visibleCountyIds)

        return {
          ...current,
          visibleCountyIds,
          exploredCountyIds,
          discoveredKingdomIds,
        }
      })
    },
    [countyNeighborIdsByCounty, computeDiscoveredKingdomIds],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const debugWindow = window as Window & {
      __britanniaFog?: { applyRevealEvent: (event: RevealEvent) => void }
    }
    debugWindow.__britanniaFog = { applyRevealEvent }

    return () => {
      delete debugWindow.__britanniaFog
    }
  }, [applyRevealEvent])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'd'
      ) {
        return
      }
      setIsFogDebugOpen((current) => !current)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const visibleCountyIds = [...fogState.visibleCountyIds].sort()
    console.debug('[FogDebug]', {
      startCountyId: fogState.startCountyId,
      visibleCountyCount: visibleCountyIds.length,
      visibleCountyIds,
    })
  }, [fogState.startCountyId, fogState.visibleCountyIds])

  useEffect(() => {
    localStorage.setItem(
      SUPERHIGHWAYS_STORAGE_KEY,
      superhighwaysEnabled ? '1' : '0',
    )
  }, [superhighwaysEnabled])

  const allCountyIdSet = useMemo(() => {
    const countyIds = new Set<string>()
    projectedMap?.counties.forEach((county) => countyIds.add(county.id))
    return countyIds
  }, [projectedMap])

  const visibleCountyIdSet = useMemo(() => {
    if (!fogEnabled) {
      return allCountyIdSet
    }
    return fogState.visibleCountyIds
  }, [allCountyIdSet, fogEnabled, fogState.visibleCountyIds])

  const exploredCountyIdSet = useMemo(() => {
    if (!fogEnabled) {
      return allCountyIdSet
    }
    const explored = new Set(fogState.exploredCountyIds)
    fogState.visibleCountyIds.forEach((countyId) => explored.add(countyId))
    return explored
  }, [allCountyIdSet, fogEnabled, fogState.exploredCountyIds, fogState.visibleCountyIds])

  const discoveredKingdomIdSet = useMemo(() => {
    if (!fogEnabled) {
      return new Set(kingdoms.map((kingdom) => kingdom.id))
    }
    return fogState.discoveredKingdomIds
  }, [fogEnabled, fogState.discoveredKingdomIds, kingdoms])

  const getCountyFogTier = useCallback(
    (countyId: string): FogTier => {
      if (!fogEnabled) {
        return 'visible'
      }
      if (visibleCountyIdSet.has(countyId)) {
        return 'visible'
      }
      if (exploredCountyIdSet.has(countyId)) {
        return 'explored'
      }
      return 'unseen'
    },
    [exploredCountyIdSet, fogEnabled, visibleCountyIdSet],
  )

  const visibleCountiesForMask = useMemo(
    () =>
      projectedMap?.counties.filter((county) =>
        visibleCountyIdSet.has(county.id),
      ) ?? [],
    [projectedMap, visibleCountyIdSet],
  )

  const exploredCountiesForMask = useMemo(
    () =>
      projectedMap?.counties.filter(
        (county) =>
          exploredCountyIdSet.has(county.id) && !visibleCountyIdSet.has(county.id),
      ) ?? [],
    [exploredCountyIdSet, projectedMap, visibleCountyIdSet],
  )

  const fogBounds = useMemo(
    () => ({
      x: -viewport.width * 3,
      y: -viewport.height * 3,
      width: viewport.width * 7,
      height: viewport.height * 7,
    }),
    [viewport.height, viewport.width],
  )

  const roadRenderModels = useMemo<RoadRenderModel[]>(() => {
    if (!projectedMap) {
      return []
    }

    const getEffectiveRoadLevel = (countyId: string): number => {
      if (superhighwaysEnabled) {
        return ROAD_LEVEL_MAX
      }
      return countyMetadataById[countyId]?.roadLevel ?? ROAD_LEVEL_MIN
    }

    const countyById = new Map(projectedMap.counties.map((county) => [county.id, county]))

    const roadModels: RoadRenderModel[] = []
    for (const edge of countyRoadEdges) {
      const countyA = countyById.get(edge.countyAId)
      const countyB = countyById.get(edge.countyBId)
      const countyAMetadata = countyMetadataById[edge.countyAId]
      const countyBMetadata = countyMetadataById[edge.countyBId]
      if (!countyA || !countyB || !countyAMetadata || !countyBMetadata) {
        continue
      }

      const countyARoadLevel = getEffectiveRoadLevel(edge.countyAId)
      const countyBRoadLevel = getEffectiveRoadLevel(edge.countyBId)
      const effectiveRoadLevel = Math.min(countyARoadLevel, countyBRoadLevel)
      if (effectiveRoadLevel < 1) {
        continue
      }

      const countyAFogTier = getCountyFogTier(edge.countyAId)
      const countyBFogTier = getCountyFogTier(edge.countyBId)
      if (
        fogEnabled &&
        (countyAFogTier === 'unseen' || countyBFogTier === 'unseen')
      ) {
        continue
      }

      const gatePoint = projectedMap.projectPoint(edge.gatePoint)
      if (!gatePoint) {
        continue
      }

      const visibility =
        fogEnabled &&
        (countyAFogTier === 'explored' || countyBFogTier === 'explored')
          ? 'explored'
          : 'visible'

      roadModels.push({
        id: edge.id,
        countyAId: edge.countyAId,
        countyBId: edge.countyBId,
        level: effectiveRoadLevel,
        visibility,
        hubA: countyA.centroid,
        gate: gatePoint,
        hubB: countyB.centroid,
      })
    }

    return roadModels
  }, [
    countyMetadataById,
    countyRoadEdges,
    fogEnabled,
    getCountyFogTier,
    projectedMap,
    superhighwaysEnabled,
  ])

  useEffect(() => {
    if (!fogEnabled || !tooltip) {
      return
    }

    if (getCountyFogTier(tooltip.countyId) === 'unseen') {
      setHoveredCountyId(null)
      setTooltip(null)
    }
  }, [fogEnabled, getCountyFogTier, tooltip])

  const portMarkers = useMemo(
    () =>
      projectedMap?.counties.filter((county) => deepwaterPortSet.has(county.id)) ??
      [],
    [deepwaterPortSet, projectedMap],
  )

  const visiblePortMarkers = useMemo(
    () =>
      fogEnabled
        ? portMarkers.filter((county) => visibleCountyIdSet.has(county.id))
        : portMarkers,
    [fogEnabled, portMarkers, visibleCountyIdSet],
  )

  const tooltipCounty = useMemo(
    () =>
      projectedMap?.counties.find((county) => county.id === tooltip?.countyId) ??
      null,
    [projectedMap, tooltip?.countyId],
  )

  const tooltipStyle = useMemo(() => {
    if (!tooltip) {
      return undefined
    }

    const tooltipWidth = 232
    const tooltipHeight = 146
    const margin = 14
    const safeTop = headerHeightPx + 8
    const maxTop = Math.max(safeTop, viewport.height - tooltipHeight - margin)
    const preferredAbove = tooltip.y - tooltipHeight - 14
    const preferredBelow = tooltip.y + 14
    const preferredTop = preferredAbove >= safeTop ? preferredAbove : preferredBelow

    return {
      left: clamp(
        tooltip.x + 16,
        margin,
        Math.max(margin, viewport.width - tooltipWidth - margin),
      ),
      top: clamp(preferredTop, safeTop, maxTop),
    }
  }, [headerHeightPx, tooltip, viewport.height, viewport.width])

  const mapLegend = useMemo(
    () =>
      kingdoms.map((kingdom) => ({
        id: kingdom.id,
        name: kingdom.name,
        color: kingdomColorById.get(kingdom.id) ?? WILDERNESS_COLOR,
      })),
    [kingdomColorById, kingdoms],
  )

  const visibleLegendEntries = useMemo(() => {
    if (!fogEnabled) {
      return mapLegend
    }
    return mapLegend.filter((entry) => discoveredKingdomIdSet.has(entry.id))
  }, [discoveredKingdomIdSet, fogEnabled, mapLegend])

  const isCountyFactionKnown = useCallback(
    (county: CountyDrawModel | null) => {
      if (!county) {
        return false
      }

      if (!fogEnabled) {
        return true
      }

      if (getCountyFogTier(county.id) !== 'visible') {
        return false
      }

      if (!county.owner || unclaimedSet.has(county.id)) {
        return true
      }

      return discoveredKingdomIdSet.has(county.owner.id)
    },
    [discoveredKingdomIdSet, fogEnabled, getCountyFogTier, unclaimedSet],
  )

  const getOwnerLabel = useCallback(
    (county: CountyDrawModel | null): string => {
      if (!county) {
        return 'Unknown'
      }
      if (!isCountyFactionKnown(county)) {
        return 'Unknown faction'
      }
      if (county.owner && !unclaimedSet.has(county.id)) {
        return county.owner.name
      }
      return 'Wilderness'
    },
    [isCountyFactionKnown, unclaimedSet],
  )

  const getCountyFill = useCallback(
    (county: CountyDrawModel): string => {
      const fogTier = getCountyFogTier(county.id)
      const isPlayerCounty = playerCountyIdSet.has(county.id)

      if (fogTier === 'unseen') {
        return '#192227'
      }

      if (isPlayerCounty && fogTier === 'visible') {
        return PLAYER_COUNTY_COLOR
      }

      if (fogTier === 'explored') {
        return EXPLORED_COUNTY_COLOR
      }

      if (
        county.owner &&
        !unclaimedSet.has(county.id) &&
        fogEnabled &&
        !discoveredKingdomIdSet.has(county.owner.id)
      ) {
        return EXPLORED_COUNTY_COLOR
      }

      let baseColor = WILDERNESS_COLOR
      if (county.owner && !unclaimedSet.has(county.id)) {
        baseColor = kingdomColorById.get(county.owner.id) ?? WILDERNESS_COLOR
      }
      const shouldApplyDevelopmentTint = !fogEnabled || fogTier === 'visible'
      if (!shouldApplyDevelopmentTint || !county.metadata) {
        return baseColor
      }

      const prosperityRatio = clamp(county.metadata.prosperityEffective / 100, 0, 1)
      const roadRatio = clamp(county.metadata.roadLevel / ROAD_LEVEL_MAX, 0, 1)
      const tintIntensity = 0.03 + prosperityRatio * 0.11 + roadRatio * 0.09
      return blendHexColor(baseColor, '#ddc790', tintIntensity)
    },
    [
      discoveredKingdomIdSet,
      fogEnabled,
      getCountyFogTier,
      kingdomColorById,
      playerCountyIdSet,
      unclaimedSet,
    ],
  )

  const updateTooltip = useCallback(
    (countyId: string, clientX: number, clientY: number) => {
      if (isDragging || settingsOpen) {
        return
      }

      if (fogEnabled && getCountyFogTier(countyId) === 'unseen') {
        setHoveredCountyId(null)
        setTooltip(null)
        return
      }

      const hostRect = mapViewportRef.current?.getBoundingClientRect()
      if (!hostRect) {
        return
      }

      setHoveredCountyId(countyId)
      setTooltip({
        countyId,
        x: clientX - hostRect.left,
        y: clientY - hostRect.top,
      })
    },
    [fogEnabled, getCountyFogTier, isDragging, settingsOpen],
  )

  const closeTooltip = useCallback(() => {
    setHoveredCountyId(null)
    setTooltip(null)
  }, [])

  useEffect(() => {
    if (settingsOpen) {
      closeTooltip()
    }
  }, [closeTooltip, settingsOpen])

  const zoomByWheel = useCallback(
    (deltaY: number, clientX: number, clientY: number) => {
      const container = mapViewportRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const pointerX = clientX - rect.left
      const pointerY = clientY - rect.top

      setTransform((current) => {
        const zoomFactor = Math.exp(-deltaY * 0.0018)
        const scale = clamp(current.scale * zoomFactor, MIN_ZOOM, MAX_ZOOM)
        if (scale === current.scale) {
          return current
        }

        const ratio = scale / current.scale
        const nextX = pointerX - (pointerX - current.x) * ratio
        const nextY = pointerY - (pointerY - current.y) * ratio
        const clamped = clampPan(nextX, nextY, scale)

        return {
          scale,
          x: clamped.x,
          y: clamped.y,
        }
      })
    },
    [clampPan],
  )

  useEffect(() => {
    const container = mapViewportRef.current
    if (!container) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      if (settingsOpen) {
        return
      }
      event.preventDefault()
      zoomByWheel(event.deltaY, event.clientX, event.clientY)
    }

    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [settingsOpen, zoomByWheel])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (settingsOpen) {
        return
      }
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      dragMovedRef.current = false
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transform.x,
        originY: transform.y,
      }
      setIsDragging(true)
      closeTooltip()
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [closeTooltip, settingsOpen, transform.x, transform.y],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      event.preventDefault()
      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
        dragMovedRef.current = true
      }

      setTransform((current) => {
        const clamped = clampPan(
          dragState.originX + deltaX,
          dragState.originY + deltaY,
          current.scale,
        )
        return { ...current, ...clamped }
      })
    },
    [clampPan],
  )

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      dragStateRef.current = null
      setIsDragging(false)
    },
    [],
  )

  const handleCountyClick = useCallback(
    (countyId: string) => {
      if (dragMovedRef.current) {
        return
      }

      if (fogEnabled && getCountyFogTier(countyId) === 'unseen') {
        return
      }

      setSelectedCountyId(countyId)
      setViewCountyMessage(null)
    },
    [fogEnabled, getCountyFogTier],
  )

  const adjustSelectedCountyRoadLevel = useCallback(
    (delta: number) => {
      if (!selectedCountyId || delta === 0) {
        return
      }

      setCountyMetadataById((current) => {
        const county = current[selectedCountyId]
        if (!county) {
          return current
        }

        const nextRoadLevel = clampInteger(
          county.roadLevel + delta,
          ROAD_LEVEL_MIN,
          ROAD_LEVEL_MAX,
        )
        if (nextRoadLevel === county.roadLevel) {
          return current
        }

        const nextCounty: CountyMetadata = {
          ...county,
          roadLevel: nextRoadLevel,
          prosperityEffective: calculateProsperityEffective(
            county.prosperityBase,
            nextRoadLevel,
            county.deepwaterPort,
          ),
        }
        const nextMetadataById: CountyMetadataById = {
          ...current,
          [selectedCountyId]: nextCounty,
        }

        persistCountyDevelopment(nextMetadataById)
        return nextMetadataById
      })
    },
    [persistCountyDevelopment, selectedCountyId],
  )

  const queueBuild = useCallback(
    (action: BuildQueueEntry['action']) => {
      if (!selectedCounty) {
        return
      }

      setBuildQueue((current) => [
        {
          id: Date.now() + current.length,
          countyId: selectedCounty.id,
          countyName: selectedCounty.name,
          action,
          createdAt: new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
        ...current,
      ])
    },
    [selectedCounty],
  )

  const handleViewCounty = useCallback(() => {
    if (!selectedCounty) {
      return
    }
    setViewCountyMessage(
      `${selectedCounty.name} micro view is a V1 stub. County scene coming next.`,
    )
  }, [selectedCounty])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  const beginWithStart = useCallback(() => {
    const fallbackStart = starts[0] ?? null
    const chosenStart =
      starts.find((start) => start.id === selectedStartId) ?? fallbackStart
    if (!chosenStart) {
      return
    }

    const normalizedCountyId = normalizeCountyId(chosenStart.startCountyId)
    if (!normalizedCountyId) {
      return
    }

    setPlayerStartId(chosenStart.id)
    setPlayerStartCountyId(normalizedCountyId)
    setPlayerCountyIds([normalizedCountyId])
    setFogState(buildInitialFogState(normalizedCountyId))
    setSelectedCountyId(normalizedCountyId)
    setViewCountyMessage(null)
    setHoveredCountyId(null)
    setTooltip(null)
    setIsStartScreenOpen(false)
    setSettingsOpen(false)
    localStorage.setItem(START_STORAGE_KEY, chosenStart.id)
  }, [buildInitialFogState, selectedStartId, starts])

  const openStartScreen = useCallback(() => {
    const preferredStartId = playerStartId ?? starts[0]?.id ?? null
    setSelectedStartId(preferredStartId)
    setIsStartScreenOpen(true)
    setSettingsOpen(false)
  }, [playerStartId, starts])

  const hudGapPx = 20
  const rightDrawerStyle = useMemo<CSSProperties>(
    () => ({
      top: `${headerHeightPx + hudGapPx}px`,
      height: `calc(100vh - ${headerHeightPx}px - ${hudGapPx * 2}px)`,
    }),
    [headerHeightPx],
  )

  const debugSafeBandStyle = useMemo<CSSProperties>(
    () => ({
      height: `${headerHeightPx}px`,
    }),
    [headerHeightPx],
  )

  const mapReady =
    !isLoading && !errorMessage && projectedMap && projectedMap.counties.length > 0
  const selectedCountyFogTier = selectedCounty
    ? getCountyFogTier(selectedCounty.id)
    : 'unseen'
  const selectedCountyIsVisible = selectedCountyFogTier === 'visible'
  const selectedCountyIsPlayerOwned = selectedCounty
    ? playerCountyIdSet.has(selectedCounty.id)
    : false
  const selectedCountyDevelopment = selectedCounty?.metadata ?? null
  const selectedRoadLevel = selectedCountyDevelopment?.roadLevel ?? ROAD_LEVEL_MIN
  const selectedRoadBonus = getRoadBonus(selectedRoadLevel)
  const selectedPortBonus =
    selectedCountyDevelopment?.deepwaterPort ? PORT_PROSPERITY_BONUS : 0
  const selectedProsperityBase =
    selectedCountyDevelopment?.prosperityBase ?? DEFAULT_PROSPERITY_BASE
  const selectedProsperityEffective =
    selectedCountyDevelopment?.prosperityEffective ?? selectedProsperityBase
  const selectedIndustrializationBase =
    selectedCountyDevelopment?.industrializationBase ??
    DEFAULT_INDUSTRIALIZATION_BASE
  const selectedProsperityPercent = clamp(selectedProsperityEffective, 0, 100)
  const selectedIndustrializationPercent = clamp(
    (selectedIndustrializationBase / INDUSTRIALIZATION_BASE_MAX) * 100,
    0,
    100,
  )
  const tooltipCountyFogTier = tooltipCounty
    ? getCountyFogTier(tooltipCounty.id)
    : 'unseen'
  const tooltipCountyIsVisible = tooltipCountyFogTier === 'visible'

  return (
    <div className={`MacroRoot${isDragging ? ' is-map-dragging' : ''}`}>
      <div
        className={`MapCanvas${isStartScreenOpen ? ' is-obscured' : ''}`}
        onPointerCancel={finishDrag}
        onPointerDown={handlePointerDown}
        onPointerLeave={finishDrag}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        ref={mapViewportRef}
      >
        {isLoading && (
          <div className="status-panel" role="status">
            <p>Loading map and realm data…</p>
          </div>
        )}
        {errorMessage && !isLoading && (
          <div className="status-panel error-panel" role="alert">
            <p>{errorMessage}</p>
          </div>
        )}
        {mapReady && projectedMap && (
          <>
            <svg
              aria-label="Macro county map"
              className={`macro-svg map-layer map-svg-base${
                isDragging ? ' is-dragging' : ''
              }`}
              height={viewport.height}
              onDragStart={(event) => event.preventDefault()}
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              width={viewport.width}
            >
              <rect
                className="map-backdrop"
                height={viewport.height}
                width={viewport.width}
                x={0}
                y={0}
              />

              <g
                transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
              >
                <g className="county-layer">
                  {projectedMap.counties.map((county) => {
                    const countyFogTier = getCountyFogTier(county.id)
                    const countyIsSelectable = countyFogTier !== 'unseen'
                    const isPlayerCounty = playerCountyIdSet.has(county.id)

                    return (
                      <path
                        className={`county-fill is-${countyFogTier}${countyIsSelectable && hoveredCountyId === county.id ? ' is-hovered' : ''}${
                          countyIsSelectable && selectedCountyId === county.id
                            ? ' is-selected'
                            : ''
                        }${isPlayerCounty ? ' is-player-owned' : ''}`}
                        d={county.d}
                        fill={getCountyFill(county)}
                        key={county.id}
                        onClick={() => handleCountyClick(county.id)}
                        onMouseEnter={(event) =>
                          updateTooltip(county.id, event.clientX, event.clientY)
                        }
                        onMouseLeave={closeTooltip}
                        onMouseMove={(event) =>
                          updateTooltip(county.id, event.clientX, event.clientY)
                        }
                        pointerEvents={countyIsSelectable ? 'auto' : 'none'}
                      />
                    )
                  })}
                </g>
              </g>
            </svg>

            <CanvasRoadLayer
              roads={roadRenderModels}
              showRoads={roadsEnabled}
              transform={transform}
              viewportHeight={viewport.height}
              viewportWidth={viewport.width}
            />

            <svg
              aria-hidden="true"
              className="macro-svg map-layer map-svg-overlay"
              height={viewport.height}
              viewBox={`0 0 ${viewport.width} ${viewport.height}`}
              width={viewport.width}
            >
              {fogEnabled && (
                <defs>
                  <filter
                    height="140%"
                    id={fogRevealFilterId}
                    width="140%"
                    x="-20%"
                    y="-20%"
                  >
                    <feGaussianBlur stdDeviation="8.4" />
                  </filter>
                  <filter
                    height="160%"
                    id={fogRevealHaloFilterId}
                    width="160%"
                    x="-30%"
                    y="-30%"
                  >
                    <feGaussianBlur stdDeviation="16" />
                  </filter>
                  <filter
                    height="140%"
                    id={fogTextureFilterId}
                    width="140%"
                    x="-20%"
                    y="-20%"
                  >
                    <feTurbulence
                      baseFrequency="0.035"
                      numOctaves="2"
                      result="noise"
                      seed="7"
                      type="fractalNoise"
                    />
                    <feColorMatrix in="noise" result="mono" type="saturate" values="0" />
                    <feComponentTransfer in="mono" result="grain">
                      <feFuncR tableValues="0 0.16" type="table" />
                      <feFuncG tableValues="0 0.16" type="table" />
                      <feFuncB tableValues="0 0.16" type="table" />
                      <feFuncA tableValues="0 0.24" type="table" />
                    </feComponentTransfer>
                    <feBlend in="SourceGraphic" in2="grain" mode="screen" />
                  </filter>
                  <mask
                    height={fogBounds.height}
                    id={fogMaskId}
                    maskContentUnits="userSpaceOnUse"
                    maskUnits="userSpaceOnUse"
                    width={fogBounds.width}
                    x={fogBounds.x}
                    y={fogBounds.y}
                  >
                    <rect
                      fill="white"
                      height={fogBounds.height}
                      width={fogBounds.width}
                      x={fogBounds.x}
                      y={fogBounds.y}
                    />
                    <g filter={`url(#${fogRevealFilterId})`}>
                      {exploredCountiesForMask.map((county) => (
                        <path
                          d={county.d}
                          fill="#8d8d8d"
                          key={`reveal-explored-${county.id}`}
                        />
                      ))}
                    </g>
                    <g filter={`url(#${fogRevealHaloFilterId})`}>
                      {exploredCountiesForMask.map((county) => (
                        <path
                          d={county.d}
                          fill="none"
                          key={`reveal-explored-halo-${county.id}`}
                          stroke="#8d8d8d"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={24}
                        />
                      ))}
                    </g>
                    <g filter={`url(#${fogRevealFilterId})`}>
                      {visibleCountiesForMask.map((county) => (
                        <path d={county.d} fill="black" key={`reveal-visible-${county.id}`} />
                      ))}
                    </g>
                    <g filter={`url(#${fogRevealHaloFilterId})`}>
                      {visibleCountiesForMask.map((county) => (
                        <path
                          d={county.d}
                          fill="none"
                          key={`reveal-visible-halo-${county.id}`}
                          stroke="black"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={34}
                        />
                      ))}
                    </g>
                  </mask>
                </defs>
              )}

              <g
                transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
              >
                {projectedMap.borderPath && (
                  <g className="borders-layer">
                    <path className="borders-path" d={projectedMap.borderPath} />
                  </g>
                )}

                <g className="player-county-layer">
                  {projectedMap.counties
                    .filter(
                      (county) =>
                        playerCountyIdSet.has(county.id) &&
                        getCountyFogTier(county.id) !== 'unseen',
                    )
                    .map((county) => (
                      <g key={`player-county-${county.id}`}>
                        <path className="player-county-glow" d={county.d} />
                        <path className="player-county-outline" d={county.d} />
                      </g>
                    ))}
                </g>

                {selectedCounty && getCountyFogTier(selectedCounty.id) !== 'unseen' && (
                  <g className="selection-layer">
                    <path className="selected-outline" d={selectedCounty.d} />
                  </g>
                )}

                <g className="ports-layer">
                  {visiblePortMarkers.map((county) => (
                    <g
                      className="port-marker"
                      key={`port-${county.id}`}
                      transform={`translate(${county.centroid[0]} ${county.centroid[1]})`}
                    >
                      <circle cx={0} cy={0} r={6.5} />
                      <path d="M 0 -4.5 L 0 4.5 M -4 1.5 L 0 4.5 L 4 1.5 M -4.5 -1.8 L 4.5 -1.8" />
                    </g>
                  ))}
                </g>

                {fogEnabled && (
                  <g className="fog-layer">
                    <rect
                      className="fog-overlay"
                      height={fogBounds.height}
                      mask={`url(#${fogMaskId})`}
                      width={fogBounds.width}
                      x={fogBounds.x}
                      y={fogBounds.y}
                    />
                    <rect
                      className="fog-texture"
                      filter={`url(#${fogTextureFilterId})`}
                      height={fogBounds.height}
                      mask={`url(#${fogMaskId})`}
                      width={fogBounds.width}
                      x={fogBounds.x}
                      y={fogBounds.y}
                    />
                  </g>
                )}
              </g>
            </svg>

            {tooltip && tooltipCounty && tooltipStyle && !isDragging && (
              <aside className="tooltip" style={tooltipStyle}>
                <h3>{tooltipCounty.name}</h3>
                <p>
                  <strong>Owner:</strong> {getOwnerLabel(tooltipCounty)}
                </p>
                <p>
                  <strong>Prosperity:</strong>{' '}
                  {tooltipCountyIsVisible
                    ? tooltipCounty.metadata?.prosperityEffective ??
                      DEFAULT_PROSPERITY_BASE
                    : 'Unknown'}
                </p>
                <p>
                  <strong>Industrialization:</strong>{' '}
                  {tooltipCountyIsVisible
                    ? tooltipCounty.metadata?.industrializationBase ??
                      DEFAULT_INDUSTRIALIZATION_BASE
                    : 'Unknown'}
                </p>
                <p>
                  <strong>Deepwater:</strong>{' '}
                  {tooltipCountyIsVisible
                    ? deepwaterPortSet.has(tooltipCounty.id)
                      ? 'Yes'
                      : 'No'
                    : 'Unknown'}
                </p>
              </aside>
            )}
          </>
        )}
      </div>

      <div className="HUD">
        <header className="HudPanel HudTopBar" ref={headerRef}>
          <div className="topbar-main">
            <p className="hud-eyebrow">Dark Ages 650 AD</p>
            <div className="topbar-title-row">
              <div className="title-chip">
                <h1>Britannia</h1>
                <button
                  data-tooltip="Settings"
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  aria-label="Open settings"
                  className={`gear-button secondary-button${
                    settingsOpen ? ' is-active' : ''
                  }`}
                  onClick={() => setSettingsOpen((current) => !current)}
                  ref={settingsGearButtonRef}
                  title="Settings"
                  type="button"
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20">
                    <path d="M 8.3 2.2 H 11.7 L 12.2 4.1 C 12.8 4.3 13.4 4.6 13.9 4.9 L 15.7 4 L 17.4 5.8 L 16.5 7.5 C 16.8 8.1 17 8.7 17.2 9.3 L 19 9.8 V 12.1 L 17.2 12.6 C 17 13.2 16.8 13.8 16.5 14.3 L 17.4 16.1 L 15.7 17.8 L 13.9 16.9 C 13.4 17.2 12.8 17.5 12.2 17.7 L 11.7 19.5 H 8.3 L 7.8 17.7 C 7.2 17.5 6.6 17.2 6.1 16.9 L 4.3 17.8 L 2.6 16.1 L 3.5 14.3 C 3.2 13.8 3 13.2 2.8 12.6 L 1 12.1 V 9.8 L 2.8 9.3 C 3 8.7 3.2 8.1 3.5 7.5 L 2.6 5.8 L 4.3 4 L 6.1 4.9 C 6.6 4.6 7.2 4.3 7.8 4.1 Z" />
                    <circle cx="10" cy="11" r="2.5" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="hud-character">
              Current Character:{' '}
              <strong>{activeCharacter?.name ?? 'Loading character...'}</strong>
              <span className="fog-state">
                Fog: <strong>{fogEnabled ? 'On' : 'Off'}</strong>
              </span>
            </p>
          </div>
          <ul className="resource-ribbon">
            {resourceStats.map((resource) => (
              <li className="resource-pill" key={resource.key} title={resource.tooltip}>
                <ResourceIcon kind={resource.key} />
                <span className="resource-pill-label">{resource.label}</span>
                <strong>{resource.value}</strong>
              </li>
            ))}
          </ul>
        </header>

        <Modal
          initialFocusRef={settingsInitialFocusRef}
          labelledBy={settingsTitleId}
          onClose={() => setSettingsOpen(false)}
          open={settingsOpen}
        >
          <section className="settings-modal">
            <header className="settings-modal-header">
              <h2 id={settingsTitleId}>Settings</h2>
              <button
                aria-label="Close settings"
                className="icon-close-button secondary-button"
                onClick={() => setSettingsOpen(false)}
                type="button"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </header>

            <div className="settings-modal-body">
              <section className="settings-section">
                <h3>Map</h3>
                <p className="settings-section-copy">
                  Tune strategic map visibility and infrastructure overlays.
                </p>
                <div className="settings-toggle-row">
                  <div className="settings-toggle-copy">
                    <p className="settings-toggle-label">Fog of War</p>
                    <p className="settings-toggle-desc">
                      Hide undiscovered counties, factions, and map borders.
                    </p>
                  </div>
                  <div className="settings-toggle-controls">
                    <button
                      aria-label={`Fog of War ${fogEnabled ? 'On' : 'Off'}`}
                      aria-pressed={fogEnabled}
                      className={`toggle-switch${fogEnabled ? ' is-on' : ''}`}
                      onClick={() => setFogEnabled((current) => !current)}
                      ref={settingsInitialFocusRef}
                      type="button"
                    >
                      <span className="toggle-thumb" />
                    </button>
                    <strong>{fogEnabled ? 'On' : 'Off'}</strong>
                  </div>
                </div>
                <div className="settings-toggle-row">
                  <div className="settings-toggle-copy">
                    <p className="settings-toggle-label">Roads</p>
                    <p className="settings-toggle-desc">
                      Show road layers and county-level infrastructure detail.
                    </p>
                  </div>
                  <div className="settings-toggle-controls">
                    <button
                      aria-label={`Roads ${roadsEnabled ? 'On' : 'Off'}`}
                      aria-pressed={roadsEnabled}
                      className={`toggle-switch${roadsEnabled ? ' is-on' : ''}`}
                      onClick={() => setRoadsEnabled((current) => !current)}
                      type="button"
                    >
                      <span className="toggle-thumb" />
                    </button>
                    <strong>{roadsEnabled ? 'On' : 'Off'}</strong>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <div className="settings-section-headline">
                  <h3>Debug / Preview</h3>
                  <span className="settings-badge">Preview</span>
                </div>
                <p className="settings-section-copy">
                  Visual test switches for iteration and balancing.
                </p>
                <div className="settings-toggle-row">
                  <div className="settings-toggle-copy">
                    <p className="settings-toggle-label">Superhighways</p>
                    <p className="settings-toggle-desc">
                      Force Level 5 road visuals everywhere (visual/debug).
                    </p>
                  </div>
                  <div className="settings-toggle-controls">
                    <button
                      aria-label={`Superhighways ${superhighwaysEnabled ? 'On' : 'Off'}`}
                      aria-pressed={superhighwaysEnabled}
                      className={`toggle-switch${superhighwaysEnabled ? ' is-on' : ''}`}
                      onClick={() => setSuperhighwaysEnabled((current) => !current)}
                      type="button"
                    >
                      <span className="toggle-thumb" />
                    </button>
                    <strong>{superhighwaysEnabled ? 'On' : 'Off'}</strong>
                  </div>
                </div>
              </section>

              <section className="settings-section settings-section-actions">
                <h3>Session</h3>
                <p className="settings-section-copy">
                  Quick utility controls for this run.
                </p>
                <div className="settings-controls">
                  <button className="secondary-button" type="button">
                    Speed x1
                  </button>
                  <button className="secondary-button" type="button">
                    Save (Stub)
                  </button>
                  <button
                    className="secondary-button"
                    onClick={resetView}
                    type="button"
                  >
                    Reset View
                  </button>
                  <button
                    className="secondary-button"
                    onClick={openStartScreen}
                    type="button"
                  >
                    Change Start
                  </button>
                </div>
              </section>

              <div
                className="roads-legend-tip"
                title="Road levels: L1 Track, L2 Packed Dirt, L3 Gravel, L4 Paved Stone, L5 Imperial Artery"
              >
                <p>Roads: L1-L5</p>
                <div className="roads-legend-swatches">
                  {ROAD_LEVEL_LABELS.slice(1).map((label, index) => (
                    <span className="roads-legend-chip" key={label}>
                      <span className={`roads-legend-line level-${index + 1}`} />
                      L{index + 1}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </Modal>

        <section className="HudPanel HudBottomLeft">
          <h2>Selected County</h2>
          {selectedCounty ? (
            <>
              <p className="county-name">
                {selectedCounty.name}{' '}
                <span className="county-code">{selectedCounty.id}</span>
                {selectedCountyIsPlayerOwned && (
                  <span className="player-badge">Your County</span>
                )}
              </p>
              <dl className="summary-facts">
                <div>
                  <dt>Owner</dt>
                  <dd>{getOwnerLabel(selectedCounty)}</dd>
                </div>
                <div>
                  <dt>Prosperity</dt>
                  <dd>
                    {selectedCountyIsVisible
                      ? selectedCounty.metadata?.prosperityEffective ??
                        DEFAULT_PROSPERITY_BASE
                      : 'Unknown'}
                  </dd>
                </div>
                <div>
                  <dt>Industrialization</dt>
                  <dd>
                    {selectedCountyIsVisible
                      ? selectedCounty.metadata?.industrializationBase ??
                        DEFAULT_INDUSTRIALIZATION_BASE
                      : 'Unknown'}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="subtle">Click a county for a summary.</p>
          )}
        </section>

        <aside className="HudPanel HudRightDrawer" style={rightDrawerStyle}>
          <section className="drawer-section">
            <h2>County Details</h2>
            {selectedCounty ? (
              <>
                <p className="county-name">
                  {selectedCounty.name}{' '}
                  <span className="county-code">{selectedCounty.id}</span>
                  {selectedCountyIsPlayerOwned && (
                    <span className="player-badge">Your County</span>
                  )}
                </p>
                <dl className="county-facts">
                  <div>
                    <dt>Owner</dt>
                    <dd>{getOwnerLabel(selectedCounty)}</dd>
                  </div>
                  <div>
                    <dt>Deepwater Port</dt>
                    <dd>
                      {selectedCountyIsVisible
                        ? deepwaterPortSet.has(selectedCounty.id)
                          ? 'Yes'
                          : 'No'
                        : 'Unknown'}
                    </dd>
                  </div>
                </dl>
                {selectedCountyIsVisible ? (
                  <section className="development-panel">
                    <h3>Development</h3>
                    <div className="dev-row">
                      <div className="dev-row-header">
                        <span>Prosperity</span>
                        <strong className="dev-value dev-value-key">
                          {selectedProsperityEffective}
                        </strong>
                      </div>
                      <div className="stat-meter">
                        <span
                          className="stat-meter-fill prosperity"
                          style={{ width: `${selectedProsperityPercent}%` }}
                        />
                      </div>
                      <p className="dev-subtext">
                        Base {selectedProsperityBase} + Roads +{selectedRoadBonus}{' '}
                        + Port +{selectedPortBonus}
                      </p>
                    </div>

                    <div className="dev-row">
                      <div className="dev-row-header">
                        <span>Industrialization</span>
                        <strong className="dev-value">
                          {selectedIndustrializationBase}
                        </strong>
                      </div>
                      <div className="stat-meter">
                        <span
                          className="stat-meter-fill industry"
                          style={{ width: `${selectedIndustrializationPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="dev-row">
                      <div className="dev-row-header">
                        <span>Roads</span>
                        <strong className="dev-value">
                          Level {selectedRoadLevel}
                        </strong>
                      </div>
                      <p className="dev-subtext road-level-label">
                        {getRoadLevelLabel(selectedRoadLevel)}
                      </p>
                      <div className="road-stepper">
                        <button
                          className="secondary-button"
                          disabled={selectedRoadLevel <= ROAD_LEVEL_MIN}
                          onClick={() => adjustSelectedCountyRoadLevel(-1)}
                          type="button"
                        >
                          -
                        </button>
                        <span className="road-stepper-value">
                          {selectedRoadLevel} / {ROAD_LEVEL_MAX}
                        </span>
                        <button
                          className="secondary-button"
                          disabled={selectedRoadLevel >= ROAD_LEVEL_MAX}
                          onClick={() => adjustSelectedCountyRoadLevel(1)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </section>
                ) : (
                  <p className="subtle development-hidden">
                    Development details are obscured by fog.
                  </p>
                )}
                {selectedCountyIsVisible && selectedCountyStarts.length > 0 && (
                  <div className="starts-tag">
                    Starts here:{' '}
                    {selectedCountyStarts.map((start) => start.name).join(', ')}
                  </div>
                )}
              </>
            ) : (
              <p className="subtle">Select a county to inspect details.</p>
            )}
          </section>

          <section className="drawer-section">
            <h2>Quick Actions</h2>
            <div className="action-group">
              <button
                disabled={!selectedCounty}
                onClick={() => queueBuild('Road I')}
                type="button"
              >
                Quick Build: Road I
              </button>
              <button
                disabled={!selectedCounty}
                onClick={() => queueBuild('Market I')}
                type="button"
              >
                Quick Build: Market I
              </button>
              <button
                className="secondary-button"
                disabled={!selectedCounty}
                onClick={handleViewCounty}
                type="button"
              >
                View County
              </button>
            </div>
            {viewCountyMessage && <p className="stub-note">{viewCountyMessage}</p>}
          </section>

          <section className="drawer-section">
            <h2>Build Queue (Selected)</h2>
            <ul className="queue-list">
              {selectedCountyQueue.length === 0 && (
                <li className="queue-empty">No queued work for this county yet.</li>
              )}
              {selectedCountyQueue.map((entry) => (
                <li className="queue-item" key={entry.id}>
                  <div>
                    <strong>{entry.action}</strong>
                    <span>{entry.countyName}</span>
                  </div>
                  <time>{entry.createdAt}</time>
                </li>
              ))}
            </ul>
          </section>

          <section className="drawer-section">
            <h2>Kingdom Colors</h2>
            <div className="legend">
              {visibleLegendEntries.map((entry) => (
                <div className="legend-item" key={entry.id}>
                  <span
                    className="legend-swatch"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span>{entry.name}</span>
                </div>
              ))}
              <div className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ backgroundColor: PLAYER_COUNTY_COLOR }}
                />
                <span>Your Realm</span>
              </div>
              <div className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ backgroundColor: WILDERNESS_COLOR }}
                />
                <span>Wilderness</span>
              </div>
              {fogEnabled && visibleLegendEntries.length === 0 && (
                <p className="legend-note subtle">No rival factions discovered yet.</p>
              )}
            </div>
          </section>
        </aside>

        {DEBUG_LAYOUT && (
          <>
            <div className="debug-safe-band" style={debugSafeBandStyle} />
            <div
              className="debug-right-drawer-outline"
              style={rightDrawerStyle}
            />
          </>
        )}

        {import.meta.env.DEV && isFogDebugOpen && (
          <aside className="HudPanel fog-debug-panel">
            <h2>Fog Debug</h2>
            <p>
              <strong>Start:</strong> {fogState.startCountyId ?? 'None'}
            </p>
            <p>
              <strong>Visible:</strong> {fogState.visibleCountyIds.size}
            </p>
            <p>
              <strong>Explored:</strong> {fogState.exploredCountyIds.size}
            </p>
            <p>
              <strong>Discovered Kingdoms:</strong>{' '}
              {fogState.discoveredKingdomIds.size}
            </p>
            <p className="fog-debug-ids">
              <strong>Visible IDs:</strong>{' '}
              {[...fogState.visibleCountyIds].sort().join(', ') || 'None'}
            </p>
          </aside>
        )}
      </div>

      {isStartScreenOpen && (
        <div className="StartOverlay" role="dialog">
          <div className="start-backdrop" />
          <section className="start-modal">
            <p className="hud-eyebrow">Choose Your Banner</p>
            <h2>Select Your Starting Character</h2>
            <p className="subtle">
              Choose a ruler and begin with their homeland revealed.
            </p>
            <div className="start-cards">
              {starts.map((start) => {
                const countyId = normalizeCountyId(start.startCountyId)
                const countyName =
                  countyMetadataById[countyId]?.displayName ?? countyId
                const isSelected = start.id === selectedStartId
                return (
                  <button
                    className={`start-card${isSelected ? ' is-selected' : ''}`}
                    key={start.id}
                    onClick={() => setSelectedStartId(start.id)}
                    type="button"
                  >
                    <h3>{start.name}</h3>
                    <p>{formatPerkDescription(start.perk)}</p>
                    <span>Start: {countyName}</span>
                  </button>
                )
              })}
            </div>
            {starts.length === 0 && (
              <p className="subtle">
                No starting characters loaded. Check{' '}
                <code>{STARTS_PATH}</code>.
              </p>
            )}
            <div className="start-actions">
              <button
                disabled={starts.length === 0}
                onClick={beginWithStart}
                type="button"
              >
                Begin
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
