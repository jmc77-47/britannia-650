import { BuildingIcon } from '../../ui/icons/buildings'
import { PortIcon } from '../../ui/icons/special'

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

const SLOT_X_OFFSETS = [-12, -4, 4, 12]
const MAP_ICON_HALF_SIZE = 6.5

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
            <circle className="marker-chip marker-chip-port" cx="0" cy="0" r="5.8" />
            <g transform={`translate(${-MAP_ICON_HALF_SIZE} ${-MAP_ICON_HALF_SIZE})`}>
              <PortIcon className="marker-icon marker-icon-port" variant="map" />
            </g>
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
                <circle className="marker-chip" cx="0" cy="0" r="5.8" />
                <g transform={`translate(${-MAP_ICON_HALF_SIZE} ${-MAP_ICON_HALF_SIZE})`}>
                  <BuildingIcon className="marker-icon" type={kind} variant="map" />
                </g>
              </g>
            ))}
            {marker.overflowCount > 0 && (
              <g className="county-marker-overflow" transform="translate(20 0)">
                <circle className="marker-chip marker-chip-overflow" cx="0" cy="0" r="5.1" />
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
