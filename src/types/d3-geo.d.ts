declare module 'd3-geo' {
  export interface GeoProjection {
    fitExtent(
      extent: [[number, number], [number, number]],
      object: unknown,
    ): GeoProjection
  }

  export interface GeoPathGenerator {
    (object: unknown): string | null
    centroid(object: unknown): [number, number]
  }

  export function geoMercator(): GeoProjection
  export function geoPath(projection?: unknown): GeoPathGenerator
}
