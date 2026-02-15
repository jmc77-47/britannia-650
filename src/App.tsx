import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import {
  feature as topoFeature,
  mesh as topoMesh,
  neighbors as topoNeighbors,
} from 'topojson-client'
import {
  MacroPanel,
  type TrackUpgradeOption,
} from './components/MacroPanel'
import { Modal } from './components/Modal'
import { TurnReportModal } from './components/TurnReportModal'
import { gameReducer } from './game/reducer'
import {
  BUILDING_ORDER,
  STORABLE_RESOURCE_KEYS,
  MAX_TRACK_LEVEL,
  TRACK_LABEL_BY_ID,
  costFitsStorageCaps,
  createEmptyBuildingLevels,
  createZeroResources,
  doesBuildingTrackConsumeSlot,
  formatCostLabel,
  getBuildingYieldForLevel,
  getCountyDefenseFromBuildingLevels,
  getPopulationUsagePerLevelForTrack,
  getStorageCapsForWarehouseLevel,
  getTrackUpgradeCost,
  getTrackUpgradeTurns,
  hasEnoughResources,
  isBuildingTrack,
  type BuildingType,
  type StorableResourceKey,
  type UpgradeTrackType,
} from './game/buildings'
import {
  CLAIM_COUNTY_COST,
  CLAIM_COUNTY_POPULATION_COST,
  CONQUER_COUNTY_COST,
  CONQUER_COUNTY_POPULATION_COST,
  NEUTRAL_OWNER_ID,
  getClaimCountyTurns,
  getConquerCountyTurns,
} from './game/countyActions'
import {
  getCountyBuildSlotsCapForBuildingLevels,
  getCountyBuildSlotsUsedForBuildingLevels,
  getCountyDerivedStats,
  getCountyPopulationUsedForBuildingLevels,
  getCountyYields,
  getPlayerPopulationTotals,
} from './game/economy'
import {
  CanvasRoadLayer,
  type RoadRenderModel,
} from './map/CanvasRoadLayer'
import { CountyMarkers, type CountyMarkerKind } from './components/map/CountyMarkers'
import {
  createInitialGameState,
  type CountyBuildOrder,
  type CountyBuildQueueState,
  type GameState,
  type ResourceStockpile,
} from './game/state'
import { assetUrl } from './lib/assetUrl'
import './App.css'

const TOPOLOGY_PATH = 'data/counties_gb_s05.topo.json'
const ADJACENCY_OVERRIDES_PATH = 'data/adjacency_overrides.json'
const DEEPWATER_PORTS_PATH = 'data/deepwater_ports.json'
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const MAP_PADDING = 26
const COUNTY_BASE_FILL = '#5a6550'
const COUNTY_HOVER_FILL = '#738260'
const COUNTY_SELECTED_FILL = '#d8ba66'
const PLAYER_FACTION_FALLBACK_FILL = '#79c5f0'
const ENEMY_FACTION_FALLBACK_FILL = '#806257'
const FOGGED_COUNTY_FILL = '#1a2328'
const EMPTY_RESOURCE_STOCKPILE: ResourceStockpile = createZeroResources()
const RESOURCE_RIBBON_ITEMS: { key: keyof ResourceStockpile; label: string }[] = [
  { key: 'gold', label: 'Gold' },
  { key: 'population', label: 'Population' },
  { key: 'wood', label: 'Wood' },
  { key: 'stone', label: 'Stone' },
  { key: 'iron', label: 'Iron' },
  { key: 'wool', label: 'Wool' },
  { key: 'leather', label: 'Leather' },
  { key: 'horses', label: 'Horses' },
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

interface TopologyData {
  type: 'Topology'
  objects: Record<string, TopologyObject>
}

interface AdjacencyOverridesPayload {
  edges?: unknown
}

interface DeepwaterPortsPayload {
  ports?: unknown
  deepwaterPorts?: unknown
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

interface CountyDrawModel {
  id: string
  name: string
  d: string
  centroid: [number, number]
}

interface LoadedMapData {
  countyFeatures: CountyFeatureCollection
  borderMesh: BorderGeometry | null
  countyNeighborIdsByCounty: Record<string, string[]>
  deepwaterPortIds: string[]
}

interface CountyRoadEdge {
  id: string
  countyAId: string
  countyBId: string
}

interface TooltipState {
  countyId: string
  x: number
  y: number
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

interface SetupCharacterCard {
  id: string
  name: string
  startCountyId: string
  startCountyName: string
  factionName: string
  factionColor: string | null
}

interface MacroGameProps {
  initialGameState: GameState
  mapData: LoadedMapData
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const normalizeCountyId = (countyId: string | null | undefined): string =>
  countyId?.trim().toUpperCase() ?? ''

const getCountyId = (
  properties: CountyTopologyProperties | null | undefined,
): string => normalizeCountyId(properties?.HCS_CODE)

const getCountyPairKey = (countyAId: string, countyBId: string): string =>
  countyAId < countyBId
    ? `${countyAId}|${countyBId}`
    : `${countyBId}|${countyAId}`

const buildCountyAdjacency = (
  object: TopologyObject,
): Record<string, string[]> => {
  const geometries = object.geometries ?? []
  // Keep neighbor indices aligned to the exact geometry list passed to topoNeighbors.
  const countyIdByGeometryIndex = geometries.map((geometry) =>
    getCountyId(geometry.properties),
  )
  const neighborIndices = topoNeighbors(geometries as unknown[])

  const adjacency: Record<string, string[]> = {}
  countyIdByGeometryIndex.forEach((countyId, countyIndex) => {
    if (!countyId) {
      return
    }

    const neighborIds = (neighborIndices[countyIndex] ?? [])
      .map((neighborIndex) => countyIdByGeometryIndex[neighborIndex] ?? '')
      .filter(
        (neighborCountyId): neighborCountyId is string =>
          neighborCountyId.length > 0 && neighborCountyId !== countyId,
      )

    adjacency[countyId] = [...new Set(neighborIds)].sort()
  })

  return adjacency
}

const parseAdjacencyOverrideEdges = (payload: unknown): [string, string][] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rawEdges = (payload as AdjacencyOverridesPayload).edges
  if (!Array.isArray(rawEdges)) {
    return []
  }

  const overrideEdges: [string, string][] = []
  rawEdges.forEach((rawEdge) => {
    if (!Array.isArray(rawEdge) || rawEdge.length < 2) {
      return
    }

    const countyAId = normalizeCountyId(
      typeof rawEdge[0] === 'string' ? rawEdge[0] : '',
    )
    const countyBId = normalizeCountyId(
      typeof rawEdge[1] === 'string' ? rawEdge[1] : '',
    )
    if (!countyAId || !countyBId || countyAId === countyBId) {
      return
    }

    overrideEdges.push([countyAId, countyBId])
  })

  return overrideEdges
}

const parseDeepwaterPortIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rawPorts =
    (payload as DeepwaterPortsPayload).ports ??
    (payload as DeepwaterPortsPayload).deepwaterPorts
  if (!Array.isArray(rawPorts)) {
    return []
  }

  const portIds = new Set<string>()
  rawPorts.forEach((rawPortId) => {
    if (typeof rawPortId !== 'string') {
      return
    }
    const countyId = normalizeCountyId(rawPortId)
    if (countyId) {
      portIds.add(countyId)
    }
  })

  return [...portIds]
}

const mergeAdjacencyOverrides = (
  baseAdjacency: Record<string, string[]>,
  overrideEdges: [string, string][],
): Record<string, string[]> => {
  const merged = new Map<string, Set<string>>()

  Object.entries(baseAdjacency).forEach(([countyId, neighbors]) => {
    const neighborSet = merged.get(countyId) ?? new Set<string>()
    neighbors.forEach((neighborId) => {
      const normalizedNeighborId = normalizeCountyId(neighborId)
      if (normalizedNeighborId && normalizedNeighborId !== countyId) {
        neighborSet.add(normalizedNeighborId)
      }
    })
    merged.set(countyId, neighborSet)
  })

  overrideEdges.forEach(([countyAId, countyBId]) => {
    const neighborsA = merged.get(countyAId) ?? new Set<string>()
    neighborsA.add(countyBId)
    merged.set(countyAId, neighborsA)

    const neighborsB = merged.get(countyBId) ?? new Set<string>()
    neighborsB.add(countyAId)
    merged.set(countyBId, neighborsB)
  })

  const adjacency: Record<string, string[]> = {}
  merged.forEach((neighbors, countyId) => {
    adjacency[countyId] = [...neighbors].sort()
  })

  return adjacency
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error while loading macro map data.'
}

const formatResourceValue = (value: number): string =>
  new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)))

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

const UPGRADE_TRACK_ORDER: UpgradeTrackType[] = ['ROADS', ...BUILDING_ORDER]

const getCountyTrackLevel = (
  countyState: GameState['counties'][string] | null | undefined,
  trackType: UpgradeTrackType,
): number => {
  if (!countyState) {
    return 0
  }
  if (trackType === 'ROADS') {
    return countyState.roadLevel
  }
  if (!isBuildingTrack(trackType)) {
    return 0
  }
  return countyState.buildings[trackType] ?? 0
}

const getQueuedTrackIncrements = (
  queueState: CountyBuildQueueState | null | undefined,
  trackType: UpgradeTrackType,
): number => {
  if (!queueState) {
    return 0
  }

  let pendingIncrements = 0
  if (
    queueState.activeOrder?.kind === 'UPGRADE_TRACK' &&
    queueState.activeOrder.trackType === trackType
  ) {
    pendingIncrements += queueState.activeOrder.targetLevelDelta
  }
  queueState.queuedOrders.forEach((order) => {
    if (order.kind === 'UPGRADE_TRACK' && order.trackType === trackType) {
      pendingIncrements += order.targetLevelDelta
    }
  })

  return pendingIncrements
}

const getQueuedBuildingLevelIncrements = (
  queueState: CountyBuildQueueState | null | undefined,
): Partial<Record<BuildingType, number>> => {
  const increments: Partial<Record<BuildingType, number>> = {}
  if (!queueState) {
    return increments
  }

  const queuedOrders = [queueState.activeOrder, ...queueState.queuedOrders].filter(
    (order): order is NonNullable<CountyBuildQueueState['activeOrder']> => !!order,
  )
  queuedOrders.forEach((order) => {
    if (order.kind !== 'UPGRADE_TRACK' || !isBuildingTrack(order.trackType)) {
      return
    }
    increments[order.trackType] = (increments[order.trackType] ?? 0) + order.targetLevelDelta
  })

  return increments
}

const applyWorkforceMultiplier = (
  yieldDelta: Partial<Record<keyof ResourceStockpile, number>>,
  workforceRatio: number,
): Partial<Record<keyof ResourceStockpile, number>> => {
  const adjusted: Partial<Record<keyof ResourceStockpile, number>> = {}
  Object.entries(yieldDelta).forEach(([resourceKey, value]) => {
    if (typeof value !== 'number' || value === 0) {
      return
    }
    const scaledValue = Math.max(0, Math.round(value * workforceRatio))
    if (scaledValue > 0) {
      adjusted[resourceKey as keyof ResourceStockpile] = scaledValue
    }
  })
  return adjusted
}

const isTypingTarget = (eventTarget: EventTarget | null): boolean => {
  if (!(eventTarget instanceof HTMLElement)) {
    return false
  }
  const tagName = eventTarget.tagName
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    eventTarget.isContentEditable
  )
}

function MacroGame({ initialGameState, mapData }: MacroGameProps) {
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const dragMovedRef = useRef(false)
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null)
  const settingsInitialFocusRef = useRef<HTMLButtonElement | null>(null)
  const previousSettingsOpenRef = useRef(false)

  const [gameState, dispatch] = useReducer(gameReducer, initialGameState)
  const [viewport, setViewport] = useState({ width: 1000, height: 700 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredCountyId, setHoveredCountyId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lastSelectedOwnedCountyId, setLastSelectedOwnedCountyId] = useState<string | null>(
    null,
  )
  const [setupCharacterId, setSetupCharacterId] = useState<string | null>(
    initialGameState.availableCharacters[0]?.id ?? null,
  )
  const fogIdBase = useId().replace(/:/g, '')
  const fogMaskId = `${fogIdBase}-mask`
  const fogRevealFilterId = `${fogIdBase}-reveal-blur`
  const fogRevealHaloFilterId = `${fogIdBase}-reveal-halo`
  const fogTextureFilterId = `${fogIdBase}-texture`
  const settingsTitleId = `${fogIdBase}-settings-title`

  const isSetupPhase = gameState.gamePhase === 'setup'
  const isFogActive = gameState.gamePhase === 'playing' && gameState.fogOfWarEnabled
  const ownedCountyIdSet = useMemo(
    () => new Set(gameState.ownedCountyIds.map((countyId) => normalizeCountyId(countyId))),
    [gameState.ownedCountyIds],
  )
  const discoveredCountyIdSet = useMemo(
    () =>
      new Set(
        gameState.discoveredCountyIds.map((countyId) => normalizeCountyId(countyId)),
      ),
    [gameState.discoveredCountyIds],
  )

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
        width: Math.max(360, Math.round(rect.width)),
        height: Math.max(460, Math.round(rect.height)),
      })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (gameState.gamePhase !== 'setup') {
      return
    }

    if (
      setupCharacterId &&
      gameState.availableCharacters.some((character) => character.id === setupCharacterId)
    ) {
      return
    }

    setSetupCharacterId(gameState.availableCharacters[0]?.id ?? null)
  }, [gameState.availableCharacters, gameState.gamePhase, setupCharacterId])

  useEffect(() => {
    if (previousSettingsOpenRef.current && !settingsOpen) {
      settingsButtonRef.current?.focus()
    }
    previousSettingsOpenRef.current = settingsOpen
  }, [settingsOpen])

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
    setTransform((current) => {
      const clamped = clampPan(current.x, current.y, current.scale)
      if (clamped.x === current.x && clamped.y === current.y) {
        return current
      }
      return { ...current, ...clamped }
    })
  }, [clampPan])

  const projectedMap = useMemo(() => {
    const projection = geoMercator()
    projection.fitExtent(
      [
        [MAP_PADDING, MAP_PADDING],
        [viewport.width - MAP_PADDING, viewport.height - MAP_PADDING],
      ],
      mapData.countyFeatures,
    )

    const pathGenerator = geoPath(projection)
    const counties = mapData.countyFeatures.features
      .map((featureItem): CountyDrawModel => {
        const countyId = getCountyId(featureItem.properties)
        const countyState = gameState.counties[countyId]
        const countyName =
          countyState?.name ?? featureItem.properties?.NAME ?? countyId
        const pathData = pathGenerator(featureItem) ?? ''
        const centroid = pathGenerator.centroid(featureItem) as [number, number]

        return {
          id: countyId,
          name: countyName,
          d: pathData,
          centroid,
        }
      })
      .filter(
        (county) =>
          county.id.length > 0 &&
          county.d.length > 0 &&
          Number.isFinite(county.centroid[0]) &&
          Number.isFinite(county.centroid[1]),
      )

    const borderPath = mapData.borderMesh ? pathGenerator(mapData.borderMesh) ?? '' : ''

    return {
      counties,
      borderPath,
    }
  }, [
    gameState.counties,
    mapData.borderMesh,
    mapData.countyFeatures,
    viewport.height,
    viewport.width,
  ])

  const allCountyIdSet = useMemo(
    () => new Set(projectedMap.counties.map((county) => county.id)),
    [projectedMap.counties],
  )

  const visibleCountyIdSet = useMemo(() => {
    if (!isFogActive) {
      return allCountyIdSet
    }

    const visibleCountyIds = new Set<string>()
    discoveredCountyIdSet.forEach((countyId) => visibleCountyIds.add(countyId))
    ownedCountyIdSet.forEach((countyId) => {
      visibleCountyIds.add(countyId)
      const neighbors = mapData.countyNeighborIdsByCounty[countyId] ?? []
      neighbors.forEach((neighborId) => {
        const normalizedNeighborId = normalizeCountyId(neighborId)
        if (normalizedNeighborId) {
          visibleCountyIds.add(normalizedNeighborId)
        }
      })
    })

    return visibleCountyIds
  }, [
    allCountyIdSet,
    discoveredCountyIdSet,
    isFogActive,
    mapData.countyNeighborIdsByCounty,
    ownedCountyIdSet,
  ])

  const visibleCountiesForMask = useMemo(
    () =>
      projectedMap.counties.filter((county) =>
        visibleCountyIdSet.has(county.id),
      ),
    [projectedMap.counties, visibleCountyIdSet],
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

  const selectedCounty = useMemo(
    () =>
      projectedMap.counties.find(
        (county) => county.id === gameState.selectedCountyId,
      ) ?? null,
    [gameState.selectedCountyId, projectedMap.counties],
  )

  const selectedCountyForPanel = useMemo(() => {
    if (selectedCounty) {
      return {
        id: selectedCounty.id,
        name: selectedCounty.name,
      }
    }

    const fallbackCountyId = gameState.selectedCountyId
    if (!fallbackCountyId) {
      return null
    }
    const fallbackCountyState = gameState.counties[fallbackCountyId]
    if (!fallbackCountyState) {
      return null
    }

    return {
      id: fallbackCountyState.id,
      name: fallbackCountyState.name,
    }
  }, [gameState.counties, gameState.selectedCountyId, selectedCounty])
  const selectedCountyState = useMemo(
    () =>
      selectedCountyForPanel
        ? gameState.counties[selectedCountyForPanel.id] ?? null
        : null,
    [gameState.counties, selectedCountyForPanel],
  )
  const selectedCountyQueueState = useMemo<CountyBuildQueueState>(
    () =>
      selectedCountyForPanel
        ? gameState.buildQueueByCountyId[selectedCountyForPanel.id] ?? { activeOrder: null, queuedOrders: [] }
        : { activeOrder: null, queuedOrders: [] },
    [gameState.buildQueueByCountyId, selectedCountyForPanel],
  )
  const warehouseQueueState = gameState.globalBuildQueue
  const playerFactionId = gameState.playerFactionId
  const selectedCountyOwnerId = selectedCountyState?.ownerId ?? NEUTRAL_OWNER_ID
  const selectedCountyOwned = useMemo(
    () =>
      selectedCountyForPanel
        ? !!playerFactionId && selectedCountyOwnerId === playerFactionId
        : false,
    [playerFactionId, selectedCountyForPanel, selectedCountyOwnerId],
  )
  useEffect(() => {
    if (!selectedCountyOwned || !selectedCountyForPanel) {
      return
    }
    setLastSelectedOwnedCountyId(selectedCountyForPanel.id)
  }, [selectedCountyForPanel, selectedCountyOwned])
  const selectedCountyActiveOrder = selectedCountyQueueState.activeOrder
  const selectedCountyQueuedOrders = selectedCountyQueueState.queuedOrders
  const warehouseActiveOrder = warehouseQueueState.activeOrder
  const warehouseQueuedOrders = warehouseQueueState.queuedOrders
  const selectedCountyDefense = useMemo(
    () =>
      selectedCountyState
        ? getCountyDefenseFromBuildingLevels(selectedCountyState.buildings)
        : 0,
    [selectedCountyState],
  )
  const selectedCountyYields = useMemo(
    () =>
      selectedCountyForPanel
        ? getCountyYields(selectedCountyForPanel.id, gameState)
        : {},
    [gameState, selectedCountyForPanel],
  )
  const selectedCountyDerivedStats = useMemo(
    () =>
      selectedCountyState
        ? getCountyDerivedStats(selectedCountyState)
        : null,
    [selectedCountyState],
  )
  const selectedCountyEffectiveRoadLevel = useMemo(
    () =>
      gameState.superhighwaysEnabled
        ? 20
        : selectedCountyState?.roadLevel ?? 0,
    [gameState.superhighwaysEnabled, selectedCountyState],
  )
  const selectedCharacter = useMemo(
    () =>
      gameState.selectedCharacterId
        ? gameState.availableCharacters.find(
            (character) => character.id === gameState.selectedCharacterId,
          ) ?? null
        : null,
    [gameState.availableCharacters, gameState.selectedCharacterId],
  )
  const playerResources = useMemo<ResourceStockpile>(() => {
    if (!playerFactionId) {
      return EMPTY_RESOURCE_STOCKPILE
    }

    return (
      gameState.resourcesByKingdomId[playerFactionId] ?? EMPTY_RESOURCE_STOCKPILE
    )
  }, [gameState.resourcesByKingdomId, playerFactionId])
  const playerPopulationTotals = useMemo(
    () => getPlayerPopulationTotals(gameState),
    [gameState],
  )
  const storageCaps = useMemo(
    () => getStorageCapsForWarehouseLevel(gameState.warehouseLevel),
    [gameState.warehouseLevel],
  )
  const displayResources = useMemo<ResourceStockpile>(
    () => ({
      ...playerResources,
      population: playerPopulationTotals.total,
    }),
    [playerPopulationTotals.total, playerResources],
  )
  const storageRiskEntries = useMemo(
    () =>
      STORABLE_RESOURCE_KEYS.map((resourceKey) => {
        const current = displayResources[resourceKey]
        const cap = storageCaps[resourceKey]
        return {
          key: resourceKey,
          current,
          cap,
        }
      }).filter((entry) => entry.cap > 0 && entry.current / entry.cap >= 0.9),
    [displayResources, storageCaps],
  )
  const selectedCountyProjectedBuildingLevels = useMemo(() => {
    if (!selectedCountyState) {
      return createEmptyBuildingLevels()
    }

    const queuedIncrements = getQueuedBuildingLevelIncrements(selectedCountyQueueState)
    const projectedLevels = { ...selectedCountyState.buildings }
    Object.entries(queuedIncrements).forEach(([buildingType, increment]) => {
      const buildingTrack = buildingType as BuildingType
      projectedLevels[buildingTrack] = Math.max(
        0,
        (projectedLevels[buildingTrack] ?? 0) + (increment ?? 0),
      )
    })

    return projectedLevels
  }, [selectedCountyQueueState, selectedCountyState])
  const selectedCountyTrackUpgrades = useMemo<TrackUpgradeOption[]>(() => {
    if (!selectedCountyState || !selectedCountyDerivedStats) {
      return []
    }

    return UPGRADE_TRACK_ORDER.map((trackType) => {
      const currentLevel = getCountyTrackLevel(selectedCountyState, trackType)
      const queuedTrackIncrements = getQueuedTrackIncrements(
        selectedCountyQueueState,
        trackType,
      )
      const nextLevel = currentLevel + queuedTrackIncrements + 1
      const turnsRequired =
        nextLevel <= MAX_TRACK_LEVEL
          ? getTrackUpgradeTurns(trackType, nextLevel)
          : 0
      const upgradeCost =
        nextLevel <= MAX_TRACK_LEVEL
          ? getTrackUpgradeCost(trackType, nextLevel)
          : {}

      let disabledReason: string | undefined
      if (!selectedCountyOwned) {
        disabledReason = 'Only player-owned counties can be developed.'
      } else if (nextLevel > MAX_TRACK_LEVEL) {
        disabledReason = 'Track already at maximum level.'
      } else if (!costFitsStorageCaps(upgradeCost, storageCaps)) {
        disabledReason = 'Requires more storage: upgrade Warehouse.'
      } else if (!hasEnoughResources(playerResources, upgradeCost)) {
        disabledReason = 'Insufficient resources.'
      }

      if (!disabledReason && isBuildingTrack(trackType)) {
        const projectedLevelsBefore = selectedCountyProjectedBuildingLevels
        const projectedTrackLevel = projectedLevelsBefore[trackType] ?? 0
        if (
          doesBuildingTrackConsumeSlot(trackType) &&
          projectedTrackLevel <= 0
        ) {
          const slotsUsed = getCountyBuildSlotsUsedForBuildingLevels(projectedLevelsBefore)
          const slotsCap = getCountyBuildSlotsCapForBuildingLevels(projectedLevelsBefore)
          if (slotsUsed >= slotsCap) {
            disabledReason = 'Slots full: increase Farm level for more specialization slots.'
          }
        }

        if (!disabledReason) {
          const projectedLevelsAfter = {
            ...projectedLevelsBefore,
            [trackType]: projectedTrackLevel + 1,
          }
          const projectedPopulationUsed =
            getCountyPopulationUsedForBuildingLevels(projectedLevelsAfter)
          if (projectedPopulationUsed > selectedCountyState.population) {
            disabledReason = 'Not enough population: upgrade Farm / Homesteads.'
          }
        }
      }

      const canUpgrade = !disabledReason

      let yieldLabel = 'No direct resource yield'
      if (isBuildingTrack(trackType)) {
        const currentYield = getBuildingYieldForLevel(trackType, currentLevel)
        const effectiveYield = applyWorkforceMultiplier(
          currentYield,
          selectedCountyDerivedStats.workforceRatio,
        )
        const hasEffectiveYield = Object.keys(effectiveYield).length > 0
        const hasYieldNow = Object.keys(currentYield).length > 0
        if (hasEffectiveYield) {
          yieldLabel = `${formatCostLabel(effectiveYield)}/turn`
        } else if (hasYieldNow) {
          yieldLabel = 'Yield blocked by workforce/cap limits'
        } else {
          const baseYield = getBuildingYieldForLevel(trackType, 1)
          yieldLabel =
            Object.keys(baseYield).length > 0
              ? `L1: ${formatCostLabel(baseYield)}/turn`
              : 'No direct resource yield'
        }
      }

      let populationImpactLabel = 'No workforce upkeep'
      const populationUsagePerLevel = getPopulationUsagePerLevelForTrack(trackType)
      if (populationUsagePerLevel > 0) {
        populationImpactLabel = `+${populationUsagePerLevel} workers / level`
      } else if (trackType === 'FARM') {
        populationImpactLabel = 'Increases population cap and slots'
      } else if (trackType === 'ROADS') {
        populationImpactLabel = 'No workforce upkeep'
      }

      if (trackType === 'ROADS') {
        yieldLabel = 'Improves travel and infrastructure'
      }

      if (trackType === 'FARM' && currentLevel > 0) {
        yieldLabel = 'Raises population cap and specialization room'
      }

      return {
        trackType,
        label: TRACK_LABEL_BY_ID[trackType],
        level: currentLevel,
        turnsRequired,
        yieldLabel,
        populationImpactLabel,
        costLabel:
          nextLevel <= MAX_TRACK_LEVEL
            ? formatCostLabel(upgradeCost)
            : 'Max level reached',
        canUpgrade,
        disabledReason,
      }
    })
  }, [
    playerResources,
    selectedCountyDerivedStats,
    selectedCountyOwned,
    selectedCountyQueueState,
    selectedCountyState,
    selectedCountyProjectedBuildingLevels,
    storageCaps,
  ])
  const warehouseUpgradeData = useMemo(() => {
    const queuedWarehouseLevels = getQueuedTrackIncrements(
      warehouseQueueState,
      'WAREHOUSE',
    )
    const nextWarehouseLevel = gameState.warehouseLevel + queuedWarehouseLevels + 1
    const turnsRequired =
      nextWarehouseLevel <= MAX_TRACK_LEVEL
        ? getTrackUpgradeTurns('WAREHOUSE', nextWarehouseLevel)
        : 0
    const cost =
      nextWarehouseLevel <= MAX_TRACK_LEVEL
        ? getTrackUpgradeCost('WAREHOUSE', nextWarehouseLevel)
        : {}

    let disabledReason: string | undefined
    if (nextWarehouseLevel > MAX_TRACK_LEVEL) {
      disabledReason = 'Warehouse already at maximum level.'
    } else if (!costFitsStorageCaps(cost, storageCaps)) {
      disabledReason = 'Requires more storage: warehouse cost exceeds current capacity.'
    } else if (!hasEnoughResources(playerResources, cost)) {
      disabledReason = 'Insufficient resources.'
    }

    return {
      cost,
      turnsRequired,
      canUpgrade: !disabledReason,
      disabledReason,
    }
  }, [gameState.warehouseLevel, playerResources, storageCaps, warehouseQueueState])

  const selectedCountyPopulation = selectedCountyDerivedStats?.population ?? 0
  const selectedCountyPopulationCap = selectedCountyDerivedStats?.populationCap ?? 0
  const selectedCountyPopulationUsed = selectedCountyDerivedStats?.populationUsed ?? 0
  const selectedCountyPopulationFree = selectedCountyDerivedStats?.populationFree ?? 0
  const selectedCountySlotsUsed = selectedCountyDerivedStats?.buildSlotsUsed ?? 0
  const selectedCountySlotsCap = selectedCountyDerivedStats?.buildSlotsCap ?? 0

  const kingdomById = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string; countyIds: string[] }
    >()
    gameState.kingdoms.forEach((kingdom) => {
      map.set(kingdom.id, kingdom)
    })
    return map
  }, [gameState.kingdoms])

  const kingdomByCountyId = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string; countyIds: string[] }
    >()
    gameState.kingdoms.forEach((kingdom) => {
      kingdom.countyIds.forEach((countyId) => {
        map.set(countyId, kingdom)
      })
    })
    return map
  }, [gameState.kingdoms])

  const getOwnerDisplayName = useCallback(
    (ownerId: string | null | undefined): string => {
      const normalizedOwnerId = ownerId?.trim() ?? ''
      if (!normalizedOwnerId || normalizedOwnerId === NEUTRAL_OWNER_ID) {
        return 'Unclaimed'
      }
      if (playerFactionId && normalizedOwnerId === playerFactionId) {
        return gameState.playerFactionName ?? 'Player'
      }

      return kingdomById.get(normalizedOwnerId)?.name ?? 'Foreign Kingdom'
    },
    [gameState.playerFactionName, kingdomById, playerFactionId],
  )

  const setupCharacterCards = useMemo<SetupCharacterCard[]>(
    () =>
      gameState.availableCharacters.map((character) => {
        const startCountyId = normalizeCountyId(character.startCountyId)
        const startCountyName =
          gameState.counties[startCountyId]?.name ?? startCountyId
        const kingdom = kingdomByCountyId.get(startCountyId) ?? null
        return {
          id: character.id,
          name: character.name,
          startCountyId,
          startCountyName,
          factionName: kingdom?.name ?? 'Independent Banner',
          factionColor: kingdom?.color ?? null,
        }
      }),
    [gameState.availableCharacters, gameState.counties, kingdomByCountyId],
  )

  const getAdjacentOwnedSourceCountyId = useCallback(
    (targetCountyId: string): string | null => {
      const normalizedTargetCountyId = normalizeCountyId(targetCountyId)
      const adjacentCountyIds = mapData.countyNeighborIdsByCounty[normalizedTargetCountyId] ?? []
      const adjacentOwnedCountyIds = adjacentCountyIds.filter((adjacentCountyId) => {
        const normalizedAdjacentCountyId = normalizeCountyId(adjacentCountyId)
        if (!normalizedAdjacentCountyId) {
          return false
        }
        return (
          !!playerFactionId &&
          gameState.counties[normalizedAdjacentCountyId]?.ownerId === playerFactionId
        )
      })

      if (adjacentOwnedCountyIds.length === 0) {
        return null
      }

      if (lastSelectedOwnedCountyId) {
        const normalizedLastOwnedCountyId = normalizeCountyId(lastSelectedOwnedCountyId)
        if (adjacentOwnedCountyIds.includes(normalizedLastOwnedCountyId)) {
          return normalizedLastOwnedCountyId
        }
      }

      return normalizeCountyId(adjacentOwnedCountyIds[0])
    },
    [gameState.counties, lastSelectedOwnedCountyId, mapData.countyNeighborIdsByCounty, playerFactionId],
  )

  const selectedCountyOwnershipKind = useMemo<
    'none' | 'owned' | 'neutral' | 'enemy'
  >(() => {
    if (!selectedCountyForPanel || !playerFactionId) {
      return 'none'
    }

    const ownerId = gameState.counties[selectedCountyForPanel.id]?.ownerId ?? NEUTRAL_OWNER_ID
    if (ownerId === playerFactionId) {
      return 'owned'
    }
    if (ownerId === NEUTRAL_OWNER_ID) {
      return 'neutral'
    }
    return 'enemy'
  }, [gameState.counties, playerFactionId, selectedCountyForPanel])

  const selectedCountyOwnerLabel = useMemo(() => {
    if (!selectedCountyForPanel) {
      return 'None selected'
    }
    return getOwnerDisplayName(gameState.counties[selectedCountyForPanel.id]?.ownerId)
  }, [gameState.counties, getOwnerDisplayName, selectedCountyForPanel])

  const selectedCountySourceId = useMemo(
    () =>
      selectedCountyForPanel
        ? getAdjacentOwnedSourceCountyId(selectedCountyForPanel.id)
        : null,
    [getAdjacentOwnedSourceCountyId, selectedCountyForPanel],
  )
  const selectedCountySourceState = useMemo(
    () =>
      selectedCountySourceId ? gameState.counties[selectedCountySourceId] ?? null : null,
    [gameState.counties, selectedCountySourceId],
  )
  const selectedCountyInteractionOrder = useMemo<CountyBuildOrder | null>(() => {
    const activeOrder = selectedCountyQueueState.activeOrder
    if (!activeOrder) {
      return null
    }
    if (activeOrder.kind === 'CLAIM_COUNTY' || activeOrder.kind === 'CONQUER_COUNTY') {
      return activeOrder
    }
    return null
  }, [selectedCountyQueueState.activeOrder])
  const selectedCountyHasQueuedOrders = selectedCountyQueueState.queuedOrders.length > 0

  const selectedCountyActionPanel = useMemo(() => {
    if (!selectedCountyForPanel || !selectedCountyState || !playerFactionId) {
      return null
    }

    const sourceCountyName = selectedCountySourceState?.name ?? null
    const sourceCountyPopulation = selectedCountySourceState?.population ?? null
    const hasBlockingOrder = !!selectedCountyInteractionOrder || selectedCountyHasQueuedOrders

    if (selectedCountyOwnershipKind === 'neutral') {
      const turnsRequired = getClaimCountyTurns(selectedCountySourceState?.roadLevel ?? 0)
      let disabledReason: string | undefined

      if (!selectedCountySourceState || !selectedCountySourceId) {
        disabledReason = 'Not adjacent to a player-owned county.'
      } else if (hasBlockingOrder) {
        disabledReason = 'Action already in progress.'
      } else if (!hasEnoughResources(playerResources, CLAIM_COUNTY_COST)) {
        disabledReason = 'Not enough resources.'
      } else if (selectedCountySourceState.population < CLAIM_COUNTY_POPULATION_COST) {
        disabledReason = 'Not enough population in source county.'
      }

      return {
        mode: 'claim' as const,
        isAdjacent: !!selectedCountySourceState,
        turnsRequired,
        costLabel: formatCostLabel(CLAIM_COUNTY_COST),
        populationCost: CLAIM_COUNTY_POPULATION_COST,
        populationCostLabel: 'Settlers',
        sourceCountyId: selectedCountySourceId,
        sourceCountyName,
        sourceCountyPopulation,
        activeOrder: selectedCountyInteractionOrder,
        canStart: !disabledReason,
        disabledReason,
      }
    }

    if (selectedCountyOwnershipKind === 'enemy') {
      const turnsRequired = getConquerCountyTurns(
        selectedCountyState.buildings.PALISADE ?? 0,
        selectedCountySourceState?.roadLevel ?? 0,
      )
      let disabledReason: string | undefined

      if (!selectedCountySourceState || !selectedCountySourceId) {
        disabledReason = 'Not adjacent to a player-owned county.'
      } else if (gameState.noConquestEnabled) {
        disabledReason = 'Conquest disabled (Settings).'
      } else if (hasBlockingOrder) {
        disabledReason = 'Action already in progress.'
      } else if (!hasEnoughResources(playerResources, CONQUER_COUNTY_COST)) {
        disabledReason = 'Not enough resources.'
      } else if (selectedCountySourceState.population < CONQUER_COUNTY_POPULATION_COST) {
        disabledReason = 'Not enough population in source county.'
      }

      return {
        mode: 'conquer' as const,
        isAdjacent: !!selectedCountySourceState,
        turnsRequired,
        costLabel: formatCostLabel(CONQUER_COUNTY_COST),
        populationCost: CONQUER_COUNTY_POPULATION_COST,
        populationCostLabel: 'Troops',
        sourceCountyId: selectedCountySourceId,
        sourceCountyName,
        sourceCountyPopulation,
        activeOrder: selectedCountyInteractionOrder,
        canStart: !disabledReason,
        disabledReason,
      }
    }

    return null
  }, [
    gameState.noConquestEnabled,
    playerFactionId,
    playerResources,
    selectedCountyForPanel,
    selectedCountyHasQueuedOrders,
    selectedCountyInteractionOrder,
    selectedCountyOwnershipKind,
    selectedCountySourceId,
    selectedCountySourceState,
    selectedCountyState,
  ])

  const tooltipCounty = useMemo(
    () =>
      projectedMap.counties.find((county) => county.id === tooltip?.countyId) ??
      null,
    [projectedMap.counties, tooltip?.countyId],
  )
  const tooltipCountyState = useMemo(
    () => (tooltipCounty ? gameState.counties[tooltipCounty.id] ?? null : null),
    [gameState.counties, tooltipCounty],
  )
  const tooltipCountyStats = useMemo(
    () => (tooltipCountyState ? getCountyDerivedStats(tooltipCountyState) : null),
    [tooltipCountyState],
  )
  const tooltipOwnerName = useMemo(
    () => getOwnerDisplayName(tooltipCountyState?.ownerId),
    [getOwnerDisplayName, tooltipCountyState?.ownerId],
  )

  const tooltipStyle = useMemo<CSSProperties | undefined>(() => {
    if (!tooltip) {
      return undefined
    }

    const tooltipWidth = 232
    const tooltipHeight = 128
    const margin = 14
    const safeTop = 14
    const maxTop = Math.max(safeTop, viewport.height - tooltipHeight - margin)
    const preferredTop = tooltip.y - tooltipHeight - 14

    return {
      left: clamp(
        tooltip.x + 16,
        margin,
        Math.max(margin, viewport.width - tooltipWidth - margin),
      ),
      top: clamp(preferredTop, safeTop, maxTop),
    }
  }, [tooltip, viewport.height, viewport.width])

  const isCountyVisible = useCallback(
    (countyId: string) =>
      !isFogActive || visibleCountyIdSet.has(normalizeCountyId(countyId)),
    [isFogActive, visibleCountyIdSet],
  )

  const getCountyFill = useCallback(
    (county: CountyDrawModel): string => {
      if (!isCountyVisible(county.id)) {
        return FOGGED_COUNTY_FILL
      }

      if (county.id === gameState.selectedCountyId) {
        return COUNTY_SELECTED_FILL
      }
      if (gameState.gamePhase === 'playing') {
        const ownerId = gameState.counties[county.id]?.ownerId ?? NEUTRAL_OWNER_ID
        if (ownerId === playerFactionId) {
          return gameState.playerFactionColor ?? PLAYER_FACTION_FALLBACK_FILL
        }
        if (ownerId !== NEUTRAL_OWNER_ID) {
          return kingdomById.get(ownerId)?.color ?? ENEMY_FACTION_FALLBACK_FILL
        }
      }
      if (county.id === hoveredCountyId) {
        return COUNTY_HOVER_FILL
      }
      return COUNTY_BASE_FILL
    },
    [
      gameState.counties,
      gameState.gamePhase,
      gameState.playerFactionColor,
      gameState.selectedCountyId,
      hoveredCountyId,
      isCountyVisible,
      kingdomById,
      playerFactionId,
    ],
  )

  const updateTooltip = useCallback(
    (countyId: string, clientX: number, clientY: number) => {
      if (isDragging || isSetupPhase || settingsOpen) {
        return
      }
      if (!isCountyVisible(countyId)) {
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
    [isCountyVisible, isDragging, isSetupPhase, settingsOpen],
  )

  const closeTooltip = useCallback(() => {
    setHoveredCountyId(null)
    setTooltip(null)
  }, [])

  useEffect(() => {
    if (isSetupPhase || settingsOpen) {
      closeTooltip()
    }
  }, [closeTooltip, isSetupPhase, settingsOpen])

  useEffect(() => {
    if (!gameState.selectedCountyId) {
      return
    }
    if (isCountyVisible(gameState.selectedCountyId)) {
      return
    }

    dispatch({
      type: 'SELECT_COUNTY',
      countyId: null,
    })
  }, [gameState.selectedCountyId, isCountyVisible])

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
      if (isSetupPhase || settingsOpen) {
        return
      }

      event.preventDefault()
      zoomByWheel(event.deltaY, event.clientX, event.clientY)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [isSetupPhase, settingsOpen, zoomByWheel])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isSetupPhase || settingsOpen || event.button !== 0) {
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
    [closeTooltip, isSetupPhase, settingsOpen, transform.x, transform.y],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    dragStateRef.current = null
    setIsDragging(false)
  }, [])

  const handleCountyClick = useCallback(
    (countyId: string) => {
      if (isSetupPhase || settingsOpen || dragMovedRef.current) {
        return
      }
      if (!isCountyVisible(countyId)) {
        return
      }

      dispatch({
        type: 'SELECT_COUNTY',
        countyId,
      })
    },
    [isCountyVisible, isSetupPhase, settingsOpen],
  )

  const countyAffordanceSets = useMemo(() => {
    const claimableCountyIds = new Set<string>()
    const conquerableCountyIds = new Set<string>()
    const sourceCountyIds = new Set<string>()

    if (!selectedCountyForPanel || !playerFactionId) {
      return {
        claimableCountyIds,
        conquerableCountyIds,
        sourceCountyIds,
      }
    }

    const selectedCountyId = selectedCountyForPanel.id
    const adjacentCountyIds = mapData.countyNeighborIdsByCounty[selectedCountyId] ?? []

    if (selectedCountyOwnershipKind === 'owned') {
      const sourcePopulation = selectedCountyState?.population ?? 0
      adjacentCountyIds.forEach((adjacentCountyId) => {
        const normalizedAdjacentCountyId = normalizeCountyId(adjacentCountyId)
        if (!normalizedAdjacentCountyId || !isCountyVisible(normalizedAdjacentCountyId)) {
          return
        }

        const adjacentCounty = gameState.counties[normalizedAdjacentCountyId]
        if (!adjacentCounty) {
          return
        }

        const adjacentQueueState = gameState.buildQueueByCountyId[normalizedAdjacentCountyId]
        const hasBlockingOrder =
          !!adjacentQueueState?.activeOrder || (adjacentQueueState?.queuedOrders.length ?? 0) > 0

        if (adjacentCounty.ownerId === NEUTRAL_OWNER_ID) {
          if (
            !hasBlockingOrder &&
            hasEnoughResources(playerResources, CLAIM_COUNTY_COST) &&
            sourcePopulation >= CLAIM_COUNTY_POPULATION_COST
          ) {
            claimableCountyIds.add(normalizedAdjacentCountyId)
          }
          return
        }

        if (
          adjacentCounty.ownerId !== playerFactionId &&
          !gameState.noConquestEnabled &&
          !hasBlockingOrder &&
          hasEnoughResources(playerResources, CONQUER_COUNTY_COST) &&
          sourcePopulation >= CONQUER_COUNTY_POPULATION_COST
        ) {
          conquerableCountyIds.add(normalizedAdjacentCountyId)
        }
      })
    } else if (selectedCountyOwnershipKind === 'neutral' || selectedCountyOwnershipKind === 'enemy') {
      adjacentCountyIds.forEach((adjacentCountyId) => {
        const normalizedAdjacentCountyId = normalizeCountyId(adjacentCountyId)
        if (!normalizedAdjacentCountyId || !isCountyVisible(normalizedAdjacentCountyId)) {
          return
        }

        if (gameState.counties[normalizedAdjacentCountyId]?.ownerId === playerFactionId) {
          sourceCountyIds.add(normalizedAdjacentCountyId)
        }
      })
    }

    return {
      claimableCountyIds,
      conquerableCountyIds,
      sourceCountyIds,
    }
  }, [
    gameState.buildQueueByCountyId,
    gameState.counties,
    isCountyVisible,
    mapData.countyNeighborIdsByCounty,
    playerFactionId,
    playerResources,
    selectedCountyForPanel,
    selectedCountyOwnershipKind,
    selectedCountyState?.population,
    gameState.noConquestEnabled,
  ])

  const deepwaterPortIdSet = useMemo(
    () => new Set(mapData.deepwaterPortIds.map((countyId) => normalizeCountyId(countyId))),
    [mapData.deepwaterPortIds],
  )

  const portMarkers = useMemo(
    () =>
      projectedMap.counties
        .filter(
          (county) => isCountyVisible(county.id) && deepwaterPortIdSet.has(county.id),
        )
        .map((county) => {
          const countyOwnerId = gameState.counties[county.id]?.ownerId ?? NEUTRAL_OWNER_ID
          return {
            countyId: county.id,
            centroid: county.centroid,
            muted: countyOwnerId !== playerFactionId,
          }
        }),
    [deepwaterPortIdSet, gameState.counties, isCountyVisible, playerFactionId, projectedMap.counties],
  )

  const countyBuildingMarkers = useMemo(() => {
    const priorityChecks: Array<{
      kind: CountyMarkerKind
      include: (countyId: string) => boolean
    }> = [
      {
        kind: 'PALISADE',
        include: (countyId) => (gameState.counties[countyId]?.buildings.PALISADE ?? 0) >= 1,
      },
      {
        kind: 'MARKET',
        include: (countyId) => (gameState.counties[countyId]?.buildings.MARKET ?? 0) >= 1,
      },
      {
        kind: 'FARM',
        include: (countyId) => (gameState.counties[countyId]?.buildings.FARM ?? 0) >= 1,
      },
      {
        kind: 'LUMBER_CAMP',
        include: (countyId) =>
          (gameState.counties[countyId]?.buildings.LUMBER_CAMP ?? 0) >= 1,
      },
      {
        kind: 'MINE',
        include: (countyId) => (gameState.counties[countyId]?.buildings.MINE ?? 0) >= 1,
      },
      {
        kind: 'QUARRY',
        include: (countyId) => (gameState.counties[countyId]?.buildings.QUARRY ?? 0) >= 1,
      },
    ]

    return projectedMap.counties
      .filter((county) => isCountyVisible(county.id))
      .map((county) => {
        const markerKinds = priorityChecks
          .filter((entry) => entry.include(county.id))
          .map((entry) => entry.kind)

        if (markerKinds.length === 0) {
          return null
        }

        const countyOwnerId = gameState.counties[county.id]?.ownerId ?? NEUTRAL_OWNER_ID
        return {
          countyId: county.id,
          centroid: county.centroid,
          markerKinds: markerKinds.slice(0, 4),
          overflowCount: Math.max(0, markerKinds.length - 4),
          muted: countyOwnerId !== playerFactionId,
        }
      })
      .filter((countyMarker): countyMarker is NonNullable<typeof countyMarker> => !!countyMarker)
  }, [gameState.counties, isCountyVisible, playerFactionId, projectedMap.counties])

  const countyRoadEdges = useMemo<CountyRoadEdge[]>(() => {
    const edges: CountyRoadEdge[] = []

    Object.entries(mapData.countyNeighborIdsByCounty).forEach(
      ([countyId, neighbors]) => {
        neighbors.forEach((neighborId) => {
          if (countyId >= neighborId) {
            return
          }

          edges.push({
            id: getCountyPairKey(countyId, neighborId),
            countyAId: countyId,
            countyBId: neighborId,
          })
        })
      },
    )

    edges.sort((left, right) => left.id.localeCompare(right.id))
    return edges
  }, [mapData.countyNeighborIdsByCounty])
  const getEffectiveRoadLevel = useCallback(
    (countyId: string): number => {
      const baseRoadLevel = gameState.counties[countyId]?.roadLevel ?? 0
      return gameState.superhighwaysEnabled ? 20 : baseRoadLevel
    },
    [gameState.counties, gameState.superhighwaysEnabled],
  )

  const roadRenderModels = useMemo<RoadRenderModel[]>(() => {
    if (isSetupPhase) {
      return []
    }

    const countyById = new Map(projectedMap.counties.map((county) => [county.id, county]))
    const roads: RoadRenderModel[] = []

    countyRoadEdges.forEach((edge) => {
      if (!isCountyVisible(edge.countyAId) || !isCountyVisible(edge.countyBId)) {
        return
      }

      const countyA = countyById.get(edge.countyAId)
      const countyB = countyById.get(edge.countyBId)
      if (!countyA || !countyB) {
        return
      }

      const level = Math.min(
        getEffectiveRoadLevel(edge.countyAId),
        getEffectiveRoadLevel(edge.countyBId),
      )
      if (level < 1) {
        return
      }

      roads.push({
        id: edge.id,
        countyAId: edge.countyAId,
        countyBId: edge.countyBId,
        level,
        visibility: 'visible',
        hubA: countyA.centroid,
        gate: [
          (countyA.centroid[0] + countyB.centroid[0]) / 2,
          (countyA.centroid[1] + countyB.centroid[1]) / 2,
        ],
        hubB: countyB.centroid,
      })
    })

    return roads
  }, [
    countyRoadEdges,
    getEffectiveRoadLevel,
    isCountyVisible,
    isSetupPhase,
    projectedMap.counties,
  ])

  const computeInitialDiscoveredCountyIds = useCallback(
    (startCountyId: string): string[] => {
      const normalizedStartCountyId = normalizeCountyId(startCountyId)
      if (!normalizedStartCountyId) {
        return []
      }

      const discoveredCountyIds = new Set<string>()
      discoveredCountyIds.add(normalizedStartCountyId)
      const neighbors =
        mapData.countyNeighborIdsByCounty[normalizedStartCountyId] ?? []
      neighbors.forEach((neighborId) => {
        const normalizedNeighborId = normalizeCountyId(neighborId)
        if (normalizedNeighborId) {
          discoveredCountyIds.add(normalizedNeighborId)
        }
      })

      return [...discoveredCountyIds]
    },
    [mapData.countyNeighborIdsByCounty],
  )

  const beginCampaign = useCallback(() => {
    if (!setupCharacterId) {
      return
    }
    const selectedCharacter = gameState.availableCharacters.find(
      (character) => character.id === setupCharacterId,
    )
    const discoveredCountyIds = selectedCharacter
      ? computeInitialDiscoveredCountyIds(selectedCharacter.startCountyId)
      : []

    dispatch({
      type: 'BEGIN_GAME_WITH_CHARACTER',
      characterId: setupCharacterId,
      discoveredCountyIds,
    })
  }, [computeInitialDiscoveredCountyIds, gameState.availableCharacters, setupCharacterId])

  const openSetup = useCallback(() => {
    setSetupCharacterId(gameState.availableCharacters[0]?.id ?? null)
    dispatch({ type: 'OPEN_SETUP' })
  }, [gameState.availableCharacters])

  const queueClaimForSelectedCounty = useCallback(() => {
    if (!selectedCountyForPanel || !selectedCountySourceId) {
      return
    }

    dispatch({
      type: 'QUEUE_CLAIM_COUNTY',
      targetCountyId: selectedCountyForPanel.id,
      sourceCountyId: selectedCountySourceId,
    })
  }, [selectedCountyForPanel, selectedCountySourceId])

  const queueConquerForSelectedCounty = useCallback(() => {
    if (!selectedCountyForPanel || !selectedCountySourceId) {
      return
    }

    dispatch({
      type: 'QUEUE_CONQUER_COUNTY',
      targetCountyId: selectedCountyForPanel.id,
      sourceCountyId: selectedCountySourceId,
    })
  }, [selectedCountyForPanel, selectedCountySourceId])

  const queueTrackUpgradeForSelectedCounty = useCallback(
    (trackType: UpgradeTrackType) => {
      if (!selectedCountyForPanel) {
        return
      }

      dispatch({
        type: 'QUEUE_TRACK_UPGRADE',
        countyId: selectedCountyForPanel.id,
        trackType,
      })
    },
    [selectedCountyForPanel],
  )
  const removeQueuedOrderForSelectedCounty = useCallback(
    (queueIndex: number) => {
      if (!selectedCountyForPanel) {
        return
      }

      dispatch({
        type: 'REMOVE_QUEUED_BUILD_ORDER',
        countyId: selectedCountyForPanel.id,
        queueIndex,
      })
    },
    [selectedCountyForPanel],
  )
  const queueWarehouseUpgrade = useCallback(() => {
    dispatch({ type: 'QUEUE_WAREHOUSE_UPGRADE' })
  }, [])
  const removeQueuedWarehouseOrder = useCallback((queueIndex: number) => {
    dispatch({
      type: 'REMOVE_QUEUED_WAREHOUSE_ORDER',
      queueIndex,
    })
  }, [])
  const handleEndTurn = useCallback(() => {
    dispatch({ type: 'END_TURN' })
  }, [])
  const closeTurnReport = useCallback(() => {
    dispatch({ type: 'CLOSE_TURN_REPORT' })
  }, [])

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.repeat) {
        return
      }
      if (isTypingTarget(event.target)) {
        return
      }
      if (isSetupPhase || settingsOpen || !!gameState.lastTurnReport) {
        return
      }

      event.preventDefault()
      handleEndTurn()
    }

    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [gameState.lastTurnReport, handleEndTurn, isSetupPhase, settingsOpen])

  return (
    <div className={`MacroRoot${isDragging ? ' is-map-dragging' : ''}`}>
      <div
        className={`MapCanvas${isSetupPhase || settingsOpen ? ' is-obscured' : ''}`}
        onPointerCancel={finishDrag}
        onPointerDown={handlePointerDown}
        onPointerLeave={finishDrag}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        ref={mapViewportRef}
      >
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

          {isFogActive && (
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
                  {visibleCountiesForMask.map((county) => (
                    <path d={county.d} fill="black" key={`fog-visible-${county.id}`} />
                  ))}
                </g>
                <g filter={`url(#${fogRevealHaloFilterId})`}>
                  {visibleCountiesForMask.map((county) => (
                    <path
                      d={county.d}
                      fill="none"
                      key={`fog-visible-halo-${county.id}`}
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

          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            <g className="county-layer">
              {projectedMap.counties.map((county) => {
                const isPlayerCounty = ownedCountyIdSet.has(county.id)
                const countyVisible = isCountyVisible(county.id)
                const isClaimAffordance =
                  countyAffordanceSets.claimableCountyIds.has(county.id)
                const isConquerAffordance =
                  countyAffordanceSets.conquerableCountyIds.has(county.id)
                const isSourceAffordance =
                  countyAffordanceSets.sourceCountyIds.has(county.id)
                return (
                  <path
                    className={`county-fill${hoveredCountyId === county.id ? ' is-hovered' : ''}${
                      gameState.selectedCountyId === county.id ? ' is-selected' : ''
                    }${isPlayerCounty ? ' is-player-owned' : ''}${
                      isClaimAffordance ? ' is-afford-claim' : ''
                    }${isConquerAffordance ? ' is-afford-conquer' : ''}${
                      isSourceAffordance ? ' is-afford-source' : ''
                    }`}
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
                    pointerEvents={countyVisible ? 'auto' : 'none'}
                  />
                )
              })}
            </g>

            {gameState.gamePhase === 'playing' && (
              <g className="county-affordance-layer" pointerEvents="none">
                {projectedMap.counties
                  .filter((county) => countyAffordanceSets.claimableCountyIds.has(county.id))
                  .map((county) => (
                    <path
                      className="county-affordance-outline is-claim"
                      d={county.d}
                      key={`claim-affordance-${county.id}`}
                    />
                  ))}
                {projectedMap.counties
                  .filter((county) => countyAffordanceSets.conquerableCountyIds.has(county.id))
                  .map((county) => (
                    <path
                      className="county-affordance-outline is-conquer"
                      d={county.d}
                      key={`conquer-affordance-${county.id}`}
                    />
                  ))}
                {projectedMap.counties
                  .filter((county) => countyAffordanceSets.sourceCountyIds.has(county.id))
                  .map((county) => (
                    <path
                      className="county-affordance-outline is-source"
                      d={county.d}
                      key={`source-affordance-${county.id}`}
                    />
                  ))}
              </g>
            )}

            {gameState.gamePhase === 'playing' && (
              <g className="player-county-layer">
                {projectedMap.counties
                  .filter(
                    (county) =>
                      ownedCountyIdSet.has(county.id) &&
                      isCountyVisible(county.id),
                  )
                  .map((county) => (
                    <g key={`player-county-${county.id}`}>
                      <path
                        className="player-county-glow"
                        d={county.d}
                        style={{
                          stroke: gameState.playerFactionColor ?? PLAYER_FACTION_FALLBACK_FILL,
                        }}
                      />
                      <path className="player-county-outline" d={county.d} />
                    </g>
                  ))}
              </g>
            )}

            {projectedMap.borderPath && (
              <g className="borders-layer">
                <path className="borders-path" d={projectedMap.borderPath} />
              </g>
            )}

            {gameState.gamePhase === 'playing' && (
              <CountyMarkers
                countyMarkers={countyBuildingMarkers}
                portMarkers={portMarkers}
              />
            )}

            {selectedCounty && (
              <g className="selection-layer">
                <path className="selected-outline" d={selectedCounty.d} />
              </g>
            )}

            {isFogActive && (
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

        <CanvasRoadLayer
          roads={roadRenderModels}
          showRoads={!isSetupPhase}
          transform={transform}
          viewportHeight={viewport.height}
          viewportWidth={viewport.width}
        />

        {!isSetupPhase &&
          tooltip &&
          tooltipCounty &&
          tooltipStyle &&
          !isDragging &&
          isCountyVisible(tooltipCounty.id) && (
          <aside className="tooltip" style={tooltipStyle}>
            <h3>{tooltipCounty.name}</h3>
            <p>
              <strong>County ID:</strong> {tooltipCounty.id}
            </p>
            <p>
              <strong>Owner:</strong> {tooltipOwnerName}
            </p>
            <p>
              <strong>Pop:</strong>{' '}
              {tooltipCountyStats
                ? `${tooltipCountyStats.population} / ${tooltipCountyStats.populationCap}`
                : 'Unknown'}
            </p>
            <p>
              <strong>Defense:</strong>{' '}
              {tooltipCountyState
                ? getCountyDefenseFromBuildingLevels(tooltipCountyState.buildings)
                : 'Unknown'}
            </p>
            <p>
              <strong>Roads:</strong> L{tooltipCountyState?.roadLevel ?? 0}
            </p>
            <p>
              <strong>Prosperity:</strong> {tooltipCountyState?.prosperity ?? 0}
            </p>
          </aside>
        )}
      </div>

      {isSetupPhase ? (
        <header className="HudPanel MacroBanner">
          <p className="hud-eyebrow">Dark Ages 650 AD</p>
          <h1>Choose Your Character</h1>
          <p className="subtle">
            Select Alphonsus, Douglas, Edmund, or Ulmann to begin your campaign.
          </p>
        </header>
      ) : (
        <header aria-label="Top resource ribbon" className="HudPanel MacroRibbon">
          <div className="macro-ribbon-main">
            <p className="hud-eyebrow">Dark Ages 650 AD</p>
            <p className="macro-ribbon-context subtle">
              Character: <strong>{selectedCharacter?.name ?? 'Unknown'}</strong> | Faction:{' '}
              <strong>{gameState.playerFactionName ?? 'Unknown banner'}</strong>
            </p>
          </div>

          <ul aria-label="Current resources" className="resource-ribbon">
            <li className="resource-pill resource-pill-turn" title="Current turn">
              <span className="resource-pill-label">Turn</span>
              <strong>{formatResourceValue(gameState.turnNumber)}</strong>
            </li>
            {RESOURCE_RIBBON_ITEMS.map((resource) => (
              <li className="resource-pill" key={resource.key} title={resource.label}>
                <span className="resource-pill-label">{resource.label}</span>
                {STORABLE_RESOURCE_KEYS.includes(resource.key as StorableResourceKey) ? (
                  <strong>
                    {formatResourceValue(displayResources[resource.key])}/
                    {formatResourceValue(
                      storageCaps[resource.key as StorableResourceKey],
                    )}
                  </strong>
                ) : (
                  <strong>{formatResourceValue(displayResources[resource.key])}</strong>
                )}
              </li>
            ))}
          </ul>

          <div className="macro-ribbon-actions">
            <button
              className="secondary-button macro-new-game-button"
              onClick={openSetup}
              type="button"
            >
              New Game
            </button>
            <button
              aria-label="Open settings"
              className={`gear-button${settingsOpen ? ' is-active' : ''}`}
              data-tooltip="Settings"
              onClick={() => setSettingsOpen(true)}
              ref={settingsButtonRef}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3.6" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              </svg>
            </button>
          </div>
        </header>
      )}

      {gameState.gamePhase === 'playing' && (
        <MacroPanel
          onEndTurn={handleEndTurn}
          onQueueTrackUpgrade={queueTrackUpgradeForSelectedCounty}
          onQueueClaimCounty={queueClaimForSelectedCounty}
          onQueueConquerCounty={queueConquerForSelectedCounty}
          onQueueWarehouseUpgrade={queueWarehouseUpgrade}
          onRemoveQueuedBuildOrder={removeQueuedOrderForSelectedCounty}
          onRemoveQueuedWarehouseOrder={removeQueuedWarehouseOrder}
          activeBuildOrder={selectedCountyActiveOrder}
          queuedBuildOrders={selectedCountyQueuedOrders}
          warehouseActiveOrder={warehouseActiveOrder}
          warehouseQueuedOrders={warehouseQueuedOrders}
          warehouseLevel={gameState.warehouseLevel}
          warehouseCaps={storageCaps}
          warehouseUpgradeCostLabel={formatCostLabel(warehouseUpgradeData.cost)}
          warehouseUpgradeDisabledReason={warehouseUpgradeData.disabledReason}
          warehouseUpgradeTurns={warehouseUpgradeData.turnsRequired}
          warehouseCanUpgrade={warehouseUpgradeData.canUpgrade}
          selectedCountyBuildingLevels={
            selectedCountyState?.buildings ?? createEmptyBuildingLevels()
          }
          selectedCountyDefense={selectedCountyDefense}
          selectedCountyEffectiveRoadLevel={selectedCountyEffectiveRoadLevel}
          selectedCountyPopulation={selectedCountyPopulation}
          selectedCountyPopulationCap={selectedCountyPopulationCap}
          selectedCountyPopulationUsed={selectedCountyPopulationUsed}
          selectedCountyPopulationFree={selectedCountyPopulationFree}
          selectedCountySlotsUsed={selectedCountySlotsUsed}
          selectedCountySlotsCap={selectedCountySlotsCap}
          selectedCountyRoadLevel={selectedCountyState?.roadLevel ?? 0}
          trackUpgradeOptions={selectedCountyTrackUpgrades}
          selectedCountyYields={selectedCountyYields}
          storageRiskEntries={storageRiskEntries}
          selectedCountyOwned={selectedCountyOwned}
          selectedCountyOwnershipKind={selectedCountyOwnershipKind}
          selectedCountyOwnerLabel={selectedCountyOwnerLabel}
          selectedCountyActionPanel={selectedCountyActionPanel}
          selectedCounty={selectedCountyForPanel}
          turnNumber={gameState.turnNumber}
        />
      )}

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
              <h3>Map Debug</h3>
              <p className="settings-section-copy">
                These temporary toggles help inspect visibility and route layers.
              </p>

              <div className="settings-toggle-row">
                <div className="settings-toggle-copy">
                  <p className="settings-toggle-label">Fog of War</p>
                  <p className="settings-toggle-desc">
                    When Off, all counties are fully revealed.
                  </p>
                </div>
                <div className="settings-toggle-controls">
                  <button
                    aria-label={`Fog of War ${gameState.fogOfWarEnabled ? 'On' : 'Off'}`}
                    aria-pressed={gameState.fogOfWarEnabled}
                    className={`toggle-switch${gameState.fogOfWarEnabled ? ' is-on' : ''}`}
                    onClick={() => dispatch({ type: 'TOGGLE_FOG_OF_WAR' })}
                    ref={settingsInitialFocusRef}
                    type="button"
                  >
                    <span className="toggle-thumb" />
                  </button>
                  <strong>{gameState.fogOfWarEnabled ? 'On' : 'Off'}</strong>
                </div>
              </div>

              <div className="settings-toggle-row">
                <div className="settings-toggle-copy">
                  <p className="settings-toggle-label">Superhighways</p>
                  <p className="settings-toggle-desc">
                    Force all visible roads to render at Level 20.
                  </p>
                </div>
                <div className="settings-toggle-controls">
                  <button
                    aria-label={`Superhighways ${gameState.superhighwaysEnabled ? 'On' : 'Off'}`}
                    aria-pressed={gameState.superhighwaysEnabled}
                    className={`toggle-switch${gameState.superhighwaysEnabled ? ' is-on' : ''}`}
                    onClick={() => dispatch({ type: 'TOGGLE_SUPERHIGHWAYS' })}
                    type="button"
                  >
                    <span className="toggle-thumb" />
                  </button>
                  <strong>{gameState.superhighwaysEnabled ? 'On' : 'Off'}</strong>
                </div>
              </div>

              <div className="settings-toggle-row">
                <div className="settings-toggle-copy">
                  <p className="settings-toggle-label">No Conquest</p>
                  <p className="settings-toggle-desc">
                    Disable conquest actions for a friendlier exploration loop.
                  </p>
                </div>
                <div className="settings-toggle-controls">
                  <button
                    aria-label={`No Conquest ${gameState.noConquestEnabled ? 'On' : 'Off'}`}
                    aria-pressed={gameState.noConquestEnabled}
                    className={`toggle-switch${gameState.noConquestEnabled ? ' is-on' : ''}`}
                    onClick={() => dispatch({ type: 'TOGGLE_NO_CONQUEST' })}
                    type="button"
                  >
                    <span className="toggle-thumb" />
                  </button>
                  <strong>{gameState.noConquestEnabled ? 'On' : 'Off'}</strong>
                </div>
              </div>
            </section>
          </div>
        </section>
      </Modal>

      <TurnReportModal onClose={closeTurnReport} report={gameState.lastTurnReport} />

      {isSetupPhase && (
        <div aria-labelledby="setup-title" aria-modal="true" className="StartOverlay" role="dialog">
          <div className="start-backdrop" />
          <section className="start-modal">
            <p className="hud-eyebrow">Game Setup</p>
            <h2 id="setup-title">Select Your Starting Character</h2>
            <p className="subtle">
              Your selection sets your opening county and faction allegiance.
            </p>
            <div className="start-cards">
              {setupCharacterCards.map((character) => {
                const isSelected = setupCharacterId === character.id
                return (
                  <button
                    className={`start-card${isSelected ? ' is-selected' : ''}`}
                    key={character.id}
                    onClick={() => setSetupCharacterId(character.id)}
                    type="button"
                  >
                    <h3>{character.name}</h3>
                    <p>
                      Start: {character.startCountyName}{' '}
                      <span className="county-code">{character.startCountyId}</span>
                    </p>
                    <p className="start-card-faction">
                      Faction:
                      <span
                        className="start-card-faction-chip"
                        style={{
                          backgroundColor: character.factionColor ?? '#65727d',
                        }}
                      />
                      {character.factionName}
                    </p>
                  </button>
                )
              })}
            </div>
            <div className="start-actions">
              <button
                disabled={!setupCharacterId || setupCharacterCards.length === 0}
                onClick={beginCampaign}
                type="button"
              >
                Begin Campaign
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function App() {
  const [mapData, setMapData] = useState<LoadedMapData | null>(null)
  const [initialGameState, setInitialGameState] = useState<GameState | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const toAssetUrl = assetUrl(import.meta.env.BASE_URL)
        const [
          topologyData,
          initialState,
          adjacencyOverridesPayload,
          deepwaterPortsPayload,
        ] =
          await Promise.all([
          fetchJson<TopologyData>(toAssetUrl(TOPOLOGY_PATH)),
          createInitialGameState(),
          fetchJson<unknown>(toAssetUrl(ADJACENCY_OVERRIDES_PATH)),
          fetchJson<unknown>(toAssetUrl(DEEPWATER_PORTS_PATH)),
        ])

        const objectName = Object.keys(topologyData.objects)[0]
        if (!objectName) {
          throw new Error('No TopoJSON object was found in map data.')
        }

        const topologyObject = topologyData.objects[objectName]
        const countyNeighborIdsByCounty = mergeAdjacencyOverrides(
          buildCountyAdjacency(topologyObject),
          parseAdjacencyOverrideEdges(adjacencyOverridesPayload),
        )
        const countyFeatures = topoFeature(
          topologyData,
          topologyObject,
        ) as CountyFeatureCollection
        const borderMesh = topoMesh(
          topologyData,
          topologyObject,
          (a: unknown, b: unknown) => a !== b,
        ) as BorderGeometry

        if (cancelled) {
          return
        }

        setMapData({
          countyFeatures,
          borderMesh,
          countyNeighborIdsByCounty,
          deepwaterPortIds: parseDeepwaterPortIds(deepwaterPortsPayload),
        })
        setInitialGameState(initialState)
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

  if (isLoading) {
    return (
      <div className="MacroRoot">
        <div className="MapCanvas">
          <div className="status-panel" role="status">
            <p>Loading macro map data…</p>
          </div>
        </div>
      </div>
    )
  }

  if (errorMessage || !mapData || !initialGameState) {
    return (
      <div className="MacroRoot">
        <div className="MapCanvas">
          <div className="status-panel error-panel" role="alert">
            <p>{errorMessage ?? 'Unable to initialize game state.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return <MacroGame initialGameState={initialGameState} mapData={mapData} />
}

export default App
