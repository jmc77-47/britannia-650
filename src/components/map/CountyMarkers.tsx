import type { JSX } from 'react'

export type CountyMarkerKind =
  | 'PALISADE'
  | 'MARKET'
  | 'FARM'
  | 'LUMBER_CAMP'
  | 'MINE'
  | 'QUARRY'

export interface CountyMarkerDatum {
  countyId: string
  centroid: [number, number]
  markerKinds: CountyMarkerKind[]
  overflowCount: number
  muted: boolean
}

export interface PortMarkerDatum {
  countyId: string
  centroid: [number, number]
  muted: boolean
}

interface CountyMarkersProps {
  portMarkers: PortMarkerDatum[]
  countyMarkers: CountyMarkerDatum[]
}

const SLOT_X_OFFSETS = [-9, -3, 3, 9]

const MarkerGlyph = ({ kind }: { kind: CountyMarkerKind }): JSX.Element => {
  switch (kind) {
    case 'PALISADE':
      return (
        <g className="marker-glyph marker-glyph-fort">
          <rect height="4.8" rx="1.1" width="7.6" x="-3.8" y="-0.4" />
          <rect height="1.6" rx="0.3" width="1.5" x="-3.7" y="-2" />
          <rect height="1.6" rx="0.3" width="1.5" x="-0.75" y="-2" />
          <rect height="1.6" rx="0.3" width="1.5" x="2.2" y="-2" />
          <rect className="marker-glyph-cutout" height="1.7" rx="0.5" width="1.5" x="-0.75" y="1.8" />
        </g>
      )
    case 'MARKET':
      return (
        <g className="marker-glyph marker-glyph-market">
          <path d="M-3.7 -1.7h7.4l-1.1 2h-5.2z" />
          <path d="M-2.6 0.3h5.2v2.4h-5.2z" />
          <path d="M-0.55 0.8h1.1v1.9h-1.1z" />
        </g>
      )
    case 'FARM':
      return (
        <g className="marker-glyph marker-glyph-farm">
          <path d="M0 2.8v-5.8" />
          <path d="M-2.2 0.8c1.6-0.3 2-1.4 2.1-2.5" />
          <path d="M2.2 -0.2c-1.6-0.3-2-1.4-2.1-2.5" />
          <path d="M-2.1 2.5c1.6-0.2 2-1.2 2.1-2.2" />
          <path d="M2.1 1.5c-1.6-0.2-2-1.2-2.1-2.2" />
        </g>
      )
    case 'LUMBER_CAMP':
      return (
        <g className="marker-glyph marker-glyph-lumber">
          <rect height="2.2" rx="1.1" width="6.6" x="-3.3" y="-0.8" />
          <circle cx="-2.2" cy="0.3" r="0.7" />
          <circle cx="2.2" cy="0.3" r="0.7" />
        </g>
      )
    case 'MINE':
      return (
        <g className="marker-glyph marker-glyph-mine">
          <path d="M-2.6 2.6l2.1-2.4m1.4-1.6l2.1-2.4" />
          <path d="M-0.4 -1.3l2.2 2.1" />
          <path d="M-2.3 1.6l2.1 2.1" />
        </g>
      )
    case 'QUARRY':
      return (
        <g className="marker-glyph marker-glyph-quarry">
          <rect height="2.3" rx="0.7" width="3.6" x="-3.8" y="-0.1" />
          <rect height="2.1" rx="0.7" width="3.4" x="-0.3" y="-1.6" />
          <rect height="2.3" rx="0.7" width="3.6" x="0.2" y="0.5" />
        </g>
      )
    default:
      return <g />
  }
}

const PortGlyph = (): JSX.Element => (
  <g className="marker-glyph marker-glyph-port">
    <path d="M0 -3.2v4.8" />
    <path d="M-2.7 -1.8h5.4" />
    <path d="M-2.8 1.6a2.8 2.8 0 0 0 5.6 0" />
    <path d="M0 1.6v2.3" />
  </g>
)

export function CountyMarkers({ portMarkers, countyMarkers }: CountyMarkersProps) {
  return (
    <>
      <g className="port-markers-layer" pointerEvents="none">
        {portMarkers.map((marker) => (
          <g
            className={`port-marker-mini${marker.muted ? ' is-muted' : ''}`}
            key={`port-marker-${marker.countyId}`}
            transform={`translate(${marker.centroid[0]} ${marker.centroid[1]})`}
          >
            <circle className="marker-chip marker-chip-port" cx="0" cy="0" r="4.2" />
            <PortGlyph />
          </g>
        ))}
      </g>

      <g className="county-markers-layer" pointerEvents="none">
        {countyMarkers.map((marker) => (
          <g
            className={`county-marker-row${marker.muted ? ' is-muted' : ''}`}
            key={`county-marker-row-${marker.countyId}`}
            transform={`translate(${marker.centroid[0]} ${marker.centroid[1] + 6})`}
          >
            {marker.markerKinds.map((kind, markerIndex) => (
              <g
                className="county-marker-icon"
                key={`${marker.countyId}-${kind}-${markerIndex}`}
                transform={`translate(${SLOT_X_OFFSETS[markerIndex] ?? 0} 0)`}
              >
                <circle className="marker-chip" cx="0" cy="0" r="4.2" />
                <MarkerGlyph kind={kind} />
              </g>
            ))}
            {marker.overflowCount > 0 && (
              <g className="county-marker-overflow" transform="translate(15 0)">
                <circle className="marker-chip marker-chip-overflow" cx="0" cy="0" r="4.1" />
                <text dy="0.35em" textAnchor="middle">
                  +{marker.overflowCount}
                </text>
              </g>
            )}
          </g>
        ))}
      </g>
    </>
  )
}
