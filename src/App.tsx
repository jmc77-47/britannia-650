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
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client'
import { MacroPanel, type MacroPanelTab } from './components/MacroPanel'
import { gameReducer } from './game/reducer'
import {
  assetUrl,
  createInitialGameState,
  type GameState,
} from './game/state'
import './App.css'

const TOPOLOGY_PATH = 'data/counties_gb_s05.topo.json'
const MIN_ZOOM = 1
const MAX_ZOOM = 6
const MAP_PADDING = 26
const COUNTY_BASE_FILL = '#5a6550'
const COUNTY_HOVER_FILL = '#738260'
const COUNTY_SELECTED_FILL = '#d8ba66'
const PLAYER_FACTION_FALLBACK_FILL = '#79c5f0'
const FOGGED_COUNTY_FILL = '#1a2328'

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

const collectArcIndices = (value: unknown, output: number[]) => {
  if (!Array.isArray(value)) {
    return
  }

  if (value.length > 0 && typeof value[0] === 'number') {
    for (const arcIndex of value) {
      if (typeof arcIndex === 'number') {
        output.push(arcIndex >= 0 ? arcIndex : ~arcIndex)
      }
    }
    return
  }

  for (const child of value) {
    collectArcIndices(child, output)
  }
}

const buildCountyAdjacency = (
  object: TopologyObject,
): Record<string, string[]> => {
  const arcOwners = new Map<number, Set<string>>()

  for (const geometry of object.geometries ?? []) {
    const countyId = getCountyId(geometry.properties)
    if (!countyId) {
      continue
    }

    const arcIndices: number[] = []
    collectArcIndices(geometry.arcs, arcIndices)
    const uniqueArcIndices = new Set(arcIndices)
    uniqueArcIndices.forEach((arcIndex) => {
      const owners = arcOwners.get(arcIndex) ?? new Set<string>()
      owners.add(countyId)
      arcOwners.set(arcIndex, owners)
    })
  }

  const adjacency = new Map<string, Set<string>>()
  arcOwners.forEach((owners) => {
    const ownerIds = [...owners]
    for (let i = 0; i < ownerIds.length; i += 1) {
      const source = ownerIds[i]
      const linked = adjacency.get(source) ?? new Set<string>()
      for (let j = 0; j < ownerIds.length; j += 1) {
        if (i !== j) {
          linked.add(ownerIds[j])
        }
      }
      adjacency.set(source, linked)
    }
  })

  const result: Record<string, string[]> = {}
  adjacency.forEach((neighbors, countyId) => {
    result[countyId] = [...neighbors].sort()
  })

  return result
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unknown error while loading macro map data.'
}

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path} (${response.status})`)
  }

  return (await response.json()) as T
}

function MacroGame({ initialGameState, mapData }: MacroGameProps) {
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const dragMovedRef = useRef(false)

  const [gameState, dispatch] = useReducer(gameReducer, initialGameState)
  const [viewport, setViewport] = useState({ width: 1000, height: 700 })
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredCountyId, setHoveredCountyId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [activeTab, setActiveTab] = useState<MacroPanelTab>('BUILD')
  const [setupCharacterId, setSetupCharacterId] = useState<string | null>(
    initialGameState.availableCharacters[0]?.id ?? null,
  )
  const fogIdBase = useId().replace(/:/g, '')
  const fogMaskId = `${fogIdBase}-mask`
  const fogRevealFilterId = `${fogIdBase}-reveal-blur`
  const fogRevealHaloFilterId = `${fogIdBase}-reveal-halo`
  const fogTextureFilterId = `${fogIdBase}-texture`

  const isSetupPhase = gameState.gamePhase === 'setup'
  const isFogActive = gameState.gamePhase === 'playing' && gameState.fogOfWarEnabled
  const discoveredCountyIdSet = useMemo(
    () => new Set(gameState.discoveredCountyIds),
    [gameState.discoveredCountyIds],
  )
  const playerFactionCountyIdSet = useMemo(
    () => new Set(gameState.playerFactionCountyIds),
    [gameState.playerFactionCountyIds],
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

  const discoveredCountiesForMask = useMemo(
    () =>
      projectedMap.counties.filter((county) =>
        discoveredCountyIdSet.has(county.id),
      ),
    [discoveredCountyIdSet, projectedMap.counties],
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
    if (!selectedCounty) {
      return null
    }

    return {
      id: selectedCounty.id,
      name: selectedCounty.name,
    }
  }, [selectedCounty])

  const selectedCharacter = useMemo(
    () =>
      gameState.selectedCharacterId
        ? gameState.availableCharacters.find(
            (character) => character.id === gameState.selectedCharacterId,
          ) ?? null
        : null,
    [gameState.availableCharacters, gameState.selectedCharacterId],
  )

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

  const tooltipCounty = useMemo(
    () =>
      projectedMap.counties.find((county) => county.id === tooltip?.countyId) ??
      null,
    [projectedMap.counties, tooltip?.countyId],
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

  const isCountyDiscovered = useCallback(
    (countyId: string) =>
      !isFogActive || discoveredCountyIdSet.has(normalizeCountyId(countyId)),
    [discoveredCountyIdSet, isFogActive],
  )

  const getCountyFill = useCallback(
    (county: CountyDrawModel): string => {
      if (!isCountyDiscovered(county.id)) {
        return FOGGED_COUNTY_FILL
      }

      if (county.id === gameState.selectedCountyId) {
        return COUNTY_SELECTED_FILL
      }
      if (
        gameState.gamePhase === 'playing' &&
        playerFactionCountyIdSet.has(county.id)
      ) {
        return gameState.playerFactionColor ?? PLAYER_FACTION_FALLBACK_FILL
      }
      if (county.id === hoveredCountyId) {
        return COUNTY_HOVER_FILL
      }
      return COUNTY_BASE_FILL
    },
    [
      gameState.gamePhase,
      gameState.playerFactionColor,
      gameState.selectedCountyId,
      hoveredCountyId,
      isCountyDiscovered,
      playerFactionCountyIdSet,
    ],
  )

  const updateTooltip = useCallback(
    (countyId: string, clientX: number, clientY: number) => {
      if (isDragging || isSetupPhase) {
        return
      }
      if (!isCountyDiscovered(countyId)) {
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
    [isCountyDiscovered, isDragging, isSetupPhase],
  )

  const closeTooltip = useCallback(() => {
    setHoveredCountyId(null)
    setTooltip(null)
  }, [])

  useEffect(() => {
    if (isSetupPhase) {
      closeTooltip()
    }
  }, [closeTooltip, isSetupPhase])

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
      if (isSetupPhase) {
        return
      }

      event.preventDefault()
      zoomByWheel(event.deltaY, event.clientX, event.clientY)
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [isSetupPhase, zoomByWheel])

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isSetupPhase || event.button !== 0) {
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
    [closeTooltip, isSetupPhase, transform.x, transform.y],
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
      if (isSetupPhase || dragMovedRef.current) {
        return
      }
      if (!isCountyDiscovered(countyId)) {
        return
      }

      dispatch({
        type: 'SELECT_COUNTY',
        countyId,
      })
    },
    [isCountyDiscovered, isSetupPhase],
  )

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

  return (
    <div className={`MacroRoot${isDragging ? ' is-map-dragging' : ''}`}>
      <div
        className={`MapCanvas${isSetupPhase ? ' is-obscured' : ''}`}
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
                  {discoveredCountiesForMask.map((county) => (
                    <path d={county.d} fill="black" key={`fog-visible-${county.id}`} />
                  ))}
                </g>
                <g filter={`url(#${fogRevealHaloFilterId})`}>
                  {discoveredCountiesForMask.map((county) => (
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
                const isPlayerCounty = playerFactionCountyIdSet.has(county.id)
                const countyDiscovered = isCountyDiscovered(county.id)
                return (
                  <path
                    className={`county-fill${hoveredCountyId === county.id ? ' is-hovered' : ''}${
                      gameState.selectedCountyId === county.id ? ' is-selected' : ''
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
                    pointerEvents={countyDiscovered ? 'auto' : 'none'}
                  />
                )
              })}
            </g>

            {gameState.gamePhase === 'playing' && (
              <g className="player-county-layer">
                {projectedMap.counties
                  .filter(
                    (county) =>
                      playerFactionCountyIdSet.has(county.id) &&
                      isCountyDiscovered(county.id),
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

        {!isSetupPhase && tooltip && tooltipCounty && tooltipStyle && !isDragging && (
          <aside className="tooltip" style={tooltipStyle}>
            <h3>{tooltipCounty.name}</h3>
            <p>
              <strong>County ID:</strong> {tooltipCounty.id}
            </p>
            <p>
              <strong>Prosperity:</strong>{' '}
              {gameState.counties[tooltipCounty.id]?.prosperity ?? 0}
            </p>
          </aside>
        )}
      </div>

      <header className="HudPanel MacroBanner">
        <p className="hud-eyebrow">Dark Ages 650 AD</p>
        <h1>{isSetupPhase ? 'Choose Your Character' : 'Macro Campaign'}</h1>
        {isSetupPhase ? (
          <p className="subtle">
            Select Alphonsus, Douglas, Edmund, or Ulmann to begin your campaign.
          </p>
        ) : (
          <p className="subtle">
            Character: <strong>{selectedCharacter?.name ?? 'Unknown'}</strong> | Faction:{' '}
            <strong>{gameState.playerFactionName ?? 'Unknown banner'}</strong>
          </p>
        )}
        {!isSetupPhase && (
          <div className="macro-banner-actions">
            <button
              className="secondary-button macro-fog-toggle-button"
              onClick={() => dispatch({ type: 'TOGGLE_FOG_OF_WAR' })}
              type="button"
            >
              Fog of War: {gameState.fogOfWarEnabled ? 'On' : 'Off'}
            </button>
            <button
              className="secondary-button macro-new-game-button"
              onClick={openSetup}
              type="button"
            >
              New Game
            </button>
          </div>
        )}
      </header>

      {gameState.gamePhase === 'playing' && (
        <MacroPanel
          activeTab={activeTab}
          onEndTurn={() => dispatch({ type: 'END_TURN' })}
          onTabChange={setActiveTab}
          selectedCounty={selectedCountyForPanel}
          turnNumber={gameState.turnNumber}
        />
      )}

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
        const [topologyData, initialState] = await Promise.all([
          fetchJson<TopologyData>(toAssetUrl(TOPOLOGY_PATH)),
          createInitialGameState(),
        ])

        const objectName = Object.keys(topologyData.objects)[0]
        if (!objectName) {
          throw new Error('No TopoJSON object was found in map data.')
        }

        const topologyObject = topologyData.objects[objectName]
        const countyNeighborIdsByCounty = buildCountyAdjacency(topologyObject)
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
