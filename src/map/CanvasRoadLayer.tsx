import { useEffect, useMemo, useRef } from 'react'
import { buildMeanderingRoadPolyline, type RoadPoint } from './roadGeometry'

export type RoadVisibility = 'visible' | 'explored'

export interface RoadRenderModel {
  id: string
  countyAId: string
  countyBId: string
  level: number
  visibility: RoadVisibility
  hubA: RoadPoint
  gate: RoadPoint
  hubB: RoadPoint
}

interface ViewTransform {
  x: number
  y: number
  scale: number
}

interface CanvasRoadLayerProps {
  roads: RoadRenderModel[]
  showRoads: boolean
  transform: ViewTransform
  viewportWidth: number
  viewportHeight: number
}

interface RoadPaintPass {
  width: number
  color: string
  alpha: number
  dash?: number[]
  shadowBlur?: number
  shadowColor?: string
}

interface RoadBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface PreparedRoad extends RoadRenderModel {
  points: RoadPoint[]
  bounds: RoadBounds
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const getRoadBounds = (points: RoadPoint[]): RoadBounds => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  points.forEach(([x, y]) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  })

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  }
}

const getRoadPaintPasses = (
  level: number,
  zoomScale: number,
  visibility: RoadVisibility,
): RoadPaintPass[] => {
  const clampedLevel = clamp(Math.round(level), 1, 5)
  const detailFactor = clamp((zoomScale - 1) / 2.5, 0, 1)
  const widthScale = clamp(0.86 + detailFactor * 0.36, 0.8, 1.24)
  const visibilityAlpha = visibility === 'visible' ? 1 : 0.46

  let passes: RoadPaintPass[]
  if (clampedLevel === 1) {
    passes = [
      { width: 2.2, color: '#2c2218', alpha: 0.26 },
      { width: 1.35, color: '#7a5f3d', alpha: 0.86, dash: [3.4, 4.2] },
      { width: 0.62, color: '#aa8556', alpha: 0.38 },
    ]
  } else if (clampedLevel === 2) {
    passes = [
      { width: 2.8, color: '#2d241b', alpha: 0.34 },
      { width: 1.96, color: '#93734a', alpha: 0.92 },
      { width: 0.82, color: '#c6a170', alpha: 0.4 },
    ]
  } else if (clampedLevel === 3) {
    passes = [
      { width: 3.5, color: '#24272a', alpha: 0.42 },
      { width: 2.7, color: '#665740', alpha: 0.96 },
      { width: 1.84, color: '#b09567', alpha: 0.9 },
      { width: 0.88, color: '#dfc49b', alpha: 0.44 },
    ]
  } else if (clampedLevel === 4) {
    passes = [
      { width: 4.25, color: '#1e2429', alpha: 0.48 },
      { width: 3.34, color: '#424b53', alpha: 0.98 },
      { width: 2.56, color: '#c3b295', alpha: 0.94 },
      { width: 1.08, color: '#ecdbb8', alpha: 0.5 },
    ]
  } else {
    passes = [
      {
        width: 6.2,
        color: '#111921',
        alpha: 0.18,
        shadowBlur: 8,
        shadowColor: 'rgba(255, 220, 155, 0.34)',
      },
      { width: 5.2, color: '#1f2732', alpha: 0.98 },
      { width: 4.2, color: '#d0c2a5', alpha: 0.97 },
      { width: 2.15, color: '#f3e3c0', alpha: 0.8 },
      { width: 0.9, color: '#fff3cf', alpha: 0.48 },
    ]
  }

  let visiblePasses = passes
  if (zoomScale < 1.24) {
    visiblePasses = passes.slice(0, 2)
  } else if (zoomScale < 1.58 && passes.length > 3) {
    visiblePasses = passes.slice(0, 3)
  }

  return visiblePasses.map((pass) => ({
    ...pass,
    width: pass.width * widthScale,
    alpha: pass.alpha * visibilityAlpha,
    dash: pass.dash?.map((value) => value * widthScale),
    shadowBlur: pass.shadowBlur
      ? pass.shadowBlur * clamp(0.78 + detailFactor * 0.45, 0.7, 1.25)
      : undefined,
  }))
}

const traceRoad = (
  context: CanvasRenderingContext2D,
  points: RoadPoint[],
  transform: ViewTransform,
) => {
  if (points.length < 2) {
    return
  }

  context.beginPath()
  points.forEach(([x, y], index) => {
    const drawX = x * transform.scale + transform.x
    const drawY = y * transform.scale + transform.y
    if (index === 0) {
      context.moveTo(drawX, drawY)
      return
    }
    context.lineTo(drawX, drawY)
  })
}

const isRoadInViewport = (
  bounds: RoadBounds,
  transform: ViewTransform,
  viewportWidth: number,
  viewportHeight: number,
) => {
  const padding = 52
  const minX = bounds.minX * transform.scale + transform.x
  const minY = bounds.minY * transform.scale + transform.y
  const maxX = bounds.maxX * transform.scale + transform.x
  const maxY = bounds.maxY * transform.scale + transform.y

  return !(
    maxX < -padding ||
    maxY < -padding ||
    minX > viewportWidth + padding ||
    minY > viewportHeight + padding
  )
}

export const CanvasRoadLayer = ({
  roads,
  showRoads,
  transform,
  viewportWidth,
  viewportHeight,
}: CanvasRoadLayerProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const preparedRoads = useMemo<PreparedRoad[]>(() => {
    return roads.map((road) => {
      const points = buildMeanderingRoadPolyline({
        edgeKey: road.id,
        hubA: road.hubA,
        gate: road.gate,
        hubB: road.hubB,
        level: road.level,
        zoomScale: transform.scale,
      })

      return {
        ...road,
        points,
        bounds: getRoadBounds(points),
      }
    })
  }, [roads, transform.scale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const targetWidth = Math.max(1, Math.round(viewportWidth * dpr))
    const targetHeight = Math.max(1, Math.round(viewportHeight * dpr))

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }

    canvas.style.width = `${viewportWidth}px`
    canvas.style.height = `${viewportHeight}px`

    const animationFrameId = requestAnimationFrame(() => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, viewportWidth, viewportHeight)

      if (!showRoads || preparedRoads.length === 0) {
        return
      }

      preparedRoads.forEach((road) => {
        if (!isRoadInViewport(road.bounds, transform, viewportWidth, viewportHeight)) {
          return
        }

        const paintPasses = getRoadPaintPasses(
          road.level,
          transform.scale,
          road.visibility,
        )

        paintPasses.forEach((pass) => {
          context.save()
          context.strokeStyle = pass.color
          context.globalAlpha = pass.alpha
          context.lineWidth = pass.width
          context.lineJoin = 'round'
          context.lineCap = 'round'
          context.setLineDash(pass.dash ?? [])
          context.shadowBlur = pass.shadowBlur ?? 0
          context.shadowColor = pass.shadowColor ?? 'transparent'

          traceRoad(context, road.points, transform)
          context.stroke()
          context.restore()
        })
      })
    })

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [
    preparedRoads,
    showRoads,
    transform,
    viewportHeight,
    viewportWidth,
  ])

  return <canvas aria-hidden="true" className="canvas-road-layer map-layer" ref={canvasRef} />
}
