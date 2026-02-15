export type RoadPoint = [number, number]

interface NoiseProfile {
  frequencyA: number
  frequencyB: number
  phaseA: number
  phaseB: number
  weightA: number
  weightB: number
  drift: number
}

interface BuildMeanderingRoadPolylineInput {
  edgeKey: string
  hubA: RoadPoint
  gate: RoadPoint
  hubB: RoadPoint
  level: number
  zoomScale: number
}

const AMPLITUDE_BY_LEVEL: Record<number, number> = {
  1: 18,
  2: 14,
  3: 9,
  4: 5,
  5: 2,
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const hashText = (value: string): number => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createMulberry32 = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let next = Math.imul(state ^ (state >>> 15), state | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const createNoiseProfile = (seedKey: string): NoiseProfile => {
  const rng = createMulberry32(hashText(seedKey))
  return {
    frequencyA: 1.15 + rng() * 1.85,
    frequencyB: 2.2 + rng() * 2.7,
    phaseA: rng() * Math.PI * 2,
    phaseB: rng() * Math.PI * 2,
    weightA: 0.58 + rng() * 0.32,
    weightB: 0.24 + rng() * 0.32,
    drift: rng() * 0.34 - 0.17,
  }
}

const evaluateNoise = (profile: NoiseProfile, t: number): number => {
  const a = Math.sin(t * Math.PI * 2 * profile.frequencyA + profile.phaseA)
  const b = Math.sin(t * Math.PI * 2 * profile.frequencyB + profile.phaseB)
  const mixed = a * profile.weightA + b * profile.weightB + profile.drift
  return clamp(mixed, -1, 1)
}

const smoothChaikin = (
  points: RoadPoint[],
  iterations: number,
  fixedStart: RoadPoint,
  fixedEnd: RoadPoint,
): RoadPoint[] => {
  let current = points
  for (let i = 0; i < iterations; i += 1) {
    if (current.length < 3) {
      break
    }

    const next: RoadPoint[] = [fixedStart]
    for (let j = 0; j < current.length - 1; j += 1) {
      const p0 = current[j]
      const p1 = current[j + 1]
      if (j === 0 || j === current.length - 2) {
        continue
      }

      next.push([
        p0[0] * 0.75 + p1[0] * 0.25,
        p0[1] * 0.75 + p1[1] * 0.25,
      ])
      next.push([
        p0[0] * 0.25 + p1[0] * 0.75,
        p0[1] * 0.25 + p1[1] * 0.75,
      ])
    }

    next.push(fixedEnd)
    current = next
  }

  return current
}

const generateMeanderSegment = (
  start: RoadPoint,
  end: RoadPoint,
  seedKey: string,
  amplitudeAtZoomOne: number,
  zoomScale: number,
  smoothIterations: number,
): RoadPoint[] => {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const distance = Math.hypot(dx, dy)
  if (distance <= 0.0001) {
    return [start, end]
  }

  const tangent: RoadPoint = [dx / distance, dy / distance]
  const normal: RoadPoint = [-tangent[1], tangent[0]]

  const zoomAmplitudeScale = clamp(1 / Math.pow(Math.max(zoomScale, 0.85), 0.35), 0.58, 1)
  const amplitude = amplitudeAtZoomOne * zoomAmplitudeScale

  const pointCount = clamp(Math.round(distance / 18), 8, 34)
  const profile = createNoiseProfile(seedKey)
  const points: RoadPoint[] = []

  for (let step = 0; step <= pointCount; step += 1) {
    const t = step / pointCount
    const base: RoadPoint = [start[0] + dx * t, start[1] + dy * t]
    const envelope = Math.sin(Math.PI * t)
    const noise = evaluateNoise(profile, t)
    const offset = amplitude * envelope * noise

    points.push([
      base[0] + normal[0] * offset,
      base[1] + normal[1] * offset,
    ])
  }

  points[0] = start
  points[points.length - 1] = end

  const smoothed = smoothChaikin(points, smoothIterations, start, end)
  smoothed[0] = start
  smoothed[smoothed.length - 1] = end
  return smoothed
}

const getSmoothIterations = (level: number): number => {
  if (level <= 2) {
    return 2
  }
  if (level === 3) {
    return 2
  }
  return 1
}

export const buildMeanderingRoadPolyline = ({
  edgeKey,
  hubA,
  gate,
  hubB,
  level,
  zoomScale,
}: BuildMeanderingRoadPolylineInput): RoadPoint[] => {
  const clampedLevel = clamp(Math.round(level), 1, 5)
  const amplitude = AMPLITUDE_BY_LEVEL[clampedLevel] ?? AMPLITUDE_BY_LEVEL[3]
  const iterations = getSmoothIterations(clampedLevel)

  const segmentA = generateMeanderSegment(
    hubA,
    gate,
    `${edgeKey}:A`,
    amplitude,
    zoomScale,
    iterations,
  )
  const segmentB = generateMeanderSegment(
    gate,
    hubB,
    `${edgeKey}:B`,
    amplitude,
    zoomScale,
    iterations,
  )

  return [...segmentA.slice(0, -1), gate, ...segmentB.slice(1)]
}
