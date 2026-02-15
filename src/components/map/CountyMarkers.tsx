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
const COUNTY_MARKER_SCALE = 2 / 3
const MARKER_EMOJI_BY_KIND: Record<CountyMarkerKind, string> = {
  PALISADE: '🛡️',
  MARKET: '🏛️',
  FARM: '🌾',
  LUMBER_CAMP: '🪵',
  MINE: '⛏️',
  QUARRY: '🧱',
}

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
            <text className="marker-emoji marker-emoji-port" dy="0.34em" textAnchor="middle">
              ⚓
            </text>
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
            <g transform={`scale(${COUNTY_MARKER_SCALE})`}>
              {marker.markerKinds.map((kind, markerIndex) => (
                <g
                  className="county-marker-icon"
                  key={`${marker.countyId}-${kind}-${markerIndex}`}
                  transform={`translate(${SLOT_X_OFFSETS[markerIndex] ?? 0} 0)`}
                >
                  <circle className="marker-chip" cx="0" cy="0" r="4.2" />
                  <text className="marker-emoji" dy="0.34em" textAnchor="middle">
                    {MARKER_EMOJI_BY_KIND[kind]}
                  </text>
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
          </g>
        ))}
      </g>
    </>
  )
}
