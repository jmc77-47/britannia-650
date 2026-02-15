declare module 'topojson-client' {
  export function feature(topology: unknown, object: unknown): unknown
  export function mesh(
    topology: unknown,
    object?: unknown,
    filter?: (a: unknown, b: unknown) => boolean,
  ): unknown
}
