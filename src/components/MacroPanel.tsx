import {
  BUILDING_DEFINITIONS,
  BUILDING_ORDER,
  MAX_TRACK_LEVEL,
  TRACK_LABEL_BY_ID,
  type BuildingType,
  type ResourceDelta,
  type StorableResourceKey,
  type UpgradeTrackType,
} from '../game/buildings'
import { getNonZeroResourceDeltaEntries } from '../game/economy'
import type { CountyBuildOrder } from '../game/state'

export type MacroPanelTab = 'BUILD' | 'TROOPS' | 'RESEARCH' | 'POLICIES'

export interface MacroPanelCounty {
  id: string
  name: string
}

export interface TrackUpgradeOption {
  trackType: UpgradeTrackType
  label: string
  level: number
  turnsRequired: number
  yieldLabel: string
  costLabel: string
  populationImpactLabel: string
  canUpgrade: boolean
  disabledReason?: string
}

interface MacroPanelProps {
  turnNumber: number
  selectedCounty: MacroPanelCounty | null
  selectedCountyOwned: boolean
  selectedCountyBuildingLevels: Record<BuildingType, number>
  selectedCountyDefense: number
  selectedCountyRoadLevel: number
  selectedCountyEffectiveRoadLevel: number
  selectedCountyPopulation: number
  selectedCountyPopulationCap: number
  selectedCountyPopulationUsed: number
  selectedCountyPopulationFree: number
  selectedCountySlotsUsed: number
  selectedCountySlotsCap: number
  selectedCountyYields: ResourceDelta
  activeBuildOrder: CountyBuildOrder | null
  queuedBuildOrders: CountyBuildOrder[]
  trackUpgradeOptions: TrackUpgradeOption[]
  warehouseLevel: number
  warehouseCaps: Record<StorableResourceKey, number>
  warehouseUpgradeCostLabel: string
  warehouseUpgradeTurns: number
  warehouseCanUpgrade: boolean
  warehouseUpgradeDisabledReason?: string
  warehouseActiveOrder: CountyBuildOrder | null
  warehouseQueuedOrders: CountyBuildOrder[]
  activeTab: MacroPanelTab
  onTabChange: (tab: MacroPanelTab) => void
  onQueueTrackUpgrade: (trackType: UpgradeTrackType) => void
  onQueueWarehouseUpgrade: () => void
  onRemoveQueuedBuildOrder: (queueIndex: number) => void
  onRemoveQueuedWarehouseOrder: (queueIndex: number) => void
  onEndTurn: () => void
}

const PANEL_TABS: { id: MacroPanelTab; label: string }[] = [
  { id: 'BUILD', label: 'Build' },
  { id: 'TROOPS', label: 'Troops' },
  { id: 'RESEARCH', label: 'Research' },
  { id: 'POLICIES', label: 'Policies' },
]

const STUB_COPY: Record<MacroPanelTab, string> = {
  BUILD: 'County development orders resolve at End Turn.',
  TROOPS: 'Troop muster and movement orders will plug in next.',
  RESEARCH: 'Realm research trees are scaffolded for a later milestone.',
  POLICIES: 'Policy toggles and realm laws are planned for later.',
}

const STORAGE_CAP_ORDER: { key: StorableResourceKey; label: string }[] = [
  { key: 'gold', label: 'Gold' },
  { key: 'wood', label: 'Wood' },
  { key: 'stone', label: 'Stone' },
  { key: 'iron', label: 'Iron' },
  { key: 'wool', label: 'Wool' },
  { key: 'leather', label: 'Leather' },
  { key: 'horses', label: 'Horses' },
]

export function MacroPanel({
  turnNumber,
  selectedCounty,
  selectedCountyOwned,
  selectedCountyBuildingLevels,
  selectedCountyDefense,
  selectedCountyRoadLevel,
  selectedCountyEffectiveRoadLevel,
  selectedCountyPopulation,
  selectedCountyPopulationCap,
  selectedCountyPopulationUsed,
  selectedCountyPopulationFree,
  selectedCountySlotsUsed,
  selectedCountySlotsCap,
  selectedCountyYields,
  activeBuildOrder,
  queuedBuildOrders,
  trackUpgradeOptions,
  warehouseLevel,
  warehouseCaps,
  warehouseUpgradeCostLabel,
  warehouseUpgradeTurns,
  warehouseCanUpgrade,
  warehouseUpgradeDisabledReason,
  warehouseActiveOrder,
  warehouseQueuedOrders,
  activeTab,
  onTabChange,
  onQueueTrackUpgrade,
  onQueueWarehouseUpgrade,
  onRemoveQueuedBuildOrder,
  onRemoveQueuedWarehouseOrder,
  onEndTurn,
}: MacroPanelProps) {
  const hasSelectedCounty = selectedCounty !== null
  const selectedCountyYieldEntries = getNonZeroResourceDeltaEntries(selectedCountyYields)
  const builtBuildingTracks = BUILDING_ORDER.filter(
    (buildingType) => (selectedCountyBuildingLevels[buildingType] ?? 0) > 0,
  )

  return (
    <aside className="HudPanel MacroPanel" aria-label="Macro controls">
      <section className="drawer-section macro-panel-header">
        <h2>Macro Command</h2>
        <p className="macro-panel-turn">
          Turn #: <strong>{turnNumber}</strong>
        </p>
        <p className="macro-panel-selection">
          <strong>Selected County:</strong>{' '}
          {selectedCounty ? (
            <>
              {selectedCounty.name} <span className="county-code">{selectedCounty.id}</span>
            </>
          ) : (
            'None selected'
          )}
        </p>
      </section>

      <section className="drawer-section">
        <div className="macro-tab-list" role="tablist" aria-label="Macro tabs">
          {PANEL_TABS.map((tab) => (
            <button
              aria-selected={activeTab === tab.id}
              className={`secondary-button macro-tab-button${
                activeTab === tab.id ? ' is-active' : ''
              }`}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="macro-tab-body" role="tabpanel">
          <p className="subtle">{STUB_COPY[activeTab]}</p>
        </div>
      </section>

      <section className="drawer-section development-section">
        <div className="development-header">
          <h3>Kingdom Logistics</h3>
          <span className="building-tag">Warehouse L{warehouseLevel}/{MAX_TRACK_LEVEL}</span>
        </div>

        <div className="development-block">
          <p className="development-subheading">Storage Caps</p>
          <ul className="storage-cap-list">
            {STORAGE_CAP_ORDER.map((resource) => (
              <li key={`storage-cap-${resource.key}`}>
                <span>{resource.label}</span>
                <strong>{warehouseCaps[resource.key]}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="development-block">
          <p className="development-subheading">Upgrade Warehouse</p>
          <div className="queue-item">
            <div>
              <strong>Warehouse +1</strong>
              <span>
                {warehouseUpgradeCostLabel} • {warehouseUpgradeTurns} turn
                {warehouseUpgradeTurns === 1 ? '' : 's'}
              </span>
            </div>
            <button
              className="secondary-button queue-remove-button"
              disabled={!warehouseCanUpgrade}
              onClick={onQueueWarehouseUpgrade}
              type="button"
            >
              Upgrade
            </button>
          </div>
          {!warehouseCanUpgrade && warehouseUpgradeDisabledReason && (
            <p className="upgrade-disabled-reason">{warehouseUpgradeDisabledReason}</p>
          )}
        </div>

        <div className="development-block">
          <p className="development-subheading">Warehouse Queue</p>
          {warehouseActiveOrder ? (
            <div className="queue-item">
              <div>
                <strong>{TRACK_LABEL_BY_ID[warehouseActiveOrder.trackType]}</strong>
                <span>{warehouseActiveOrder.turnsRemaining} turn(s) remaining</span>
              </div>
            </div>
          ) : (
            <p className="queue-empty">No active warehouse project.</p>
          )}

          {warehouseQueuedOrders.length > 0 ? (
            <ul className="queue-list">
              {warehouseQueuedOrders.map((order, queueIndex) => (
                <li className="queue-item" key={order.id}>
                  <div>
                    <strong>{TRACK_LABEL_BY_ID[order.trackType]}</strong>
                    <span>{order.turnsRemaining} turn(s)</span>
                  </div>
                  <button
                    className="secondary-button queue-remove-button"
                    onClick={() => onRemoveQueuedWarehouseOrder(queueIndex)}
                    type="button"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="queue-empty">No queued warehouse upgrades.</p>
          )}
        </div>
      </section>

      {hasSelectedCounty && (
        <section className="drawer-section development-section">
          <div className="development-header">
            <h3>Development</h3>
            <span
              className={`ownership-pill${selectedCountyOwned ? ' is-owned' : ' is-foreign'}`}
            >
              {selectedCountyOwned ? 'Owned' : 'Not owned'}
            </span>
          </div>

          <div className="development-tags">
            {builtBuildingTracks.length > 0 ? (
              builtBuildingTracks.map((buildingType) => (
                <span className="building-tag" key={`building-tag-${buildingType}`}>
                  {BUILDING_DEFINITIONS[buildingType].badge} L{selectedCountyBuildingLevels[buildingType]}
                </span>
              ))
            ) : (
              <span className="building-tag is-empty">No county upgrades yet</span>
            )}
            {selectedCountyDefense > 0 && (
              <span className="building-tag is-defense">Defense +{selectedCountyDefense}</span>
            )}
          </div>

          <div className="development-block">
            <p className="development-subheading">County stats</p>
            <dl className="county-stats-list">
              <div>
                <dt>Roads</dt>
                <dd>
                  L{selectedCountyRoadLevel}
                  {selectedCountyEffectiveRoadLevel !== selectedCountyRoadLevel && (
                    <span className="stats-muted"> (effective L{selectedCountyEffectiveRoadLevel})</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Defense</dt>
                <dd>{selectedCountyDefense}</dd>
              </div>
              <div>
                <dt>Population</dt>
                <dd>{selectedCountyPopulation} / {selectedCountyPopulationCap}</dd>
              </div>
              <div>
                <dt>Workers</dt>
                <dd>{selectedCountyPopulationUsed} used / {selectedCountyPopulationFree} free</dd>
              </div>
              <div>
                <dt>Slots</dt>
                <dd>{selectedCountySlotsUsed} / {selectedCountySlotsCap}</dd>
              </div>
            </dl>
          </div>

          <div className="development-block">
            <p className="development-subheading">Yields per turn</p>
            {selectedCountyYieldEntries.length > 0 ? (
              <ul className="county-yield-list">
                {selectedCountyYieldEntries.map((entry) => (
                  <li key={`county-yield-${entry.key}`}>
                    <span>{entry.label}</span>
                    <strong>+{entry.amount}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">No per-turn yields from this county.</p>
            )}
          </div>

          <div className="development-block">
            <p className="development-subheading">Upgrade tracks</p>
            {selectedCountyOwned ? (
              <ul className="track-upgrade-list">
                {trackUpgradeOptions.map((track) => (
                  <li className="track-upgrade-item" key={`track-upgrade-${track.trackType}`}>
                    <div className="track-upgrade-meta">
                      <strong>
                        {track.label} <span className="stats-muted">L{track.level}/{MAX_TRACK_LEVEL}</span>
                      </strong>
                      <span>{track.yieldLabel}</span>
                      <span>{track.populationImpactLabel}</span>
                      <span>
                        {track.costLabel} • {track.turnsRequired} turn{track.turnsRequired === 1 ? '' : 's'}
                      </span>
                      {!track.canUpgrade && track.disabledReason && (
                        <span className="upgrade-disabled-reason">{track.disabledReason}</span>
                      )}
                    </div>
                    <button
                      className="secondary-button queue-remove-button"
                      disabled={!track.canUpgrade}
                      onClick={() => onQueueTrackUpgrade(track.trackType)}
                      type="button"
                    >
                      Upgrade +1
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">Only player-owned counties can be developed.</p>
            )}
          </div>

          <div className="development-block">
            <p className="development-subheading">In progress</p>
            {activeBuildOrder ? (
              <div className="queue-item">
                <div>
                  <strong>{TRACK_LABEL_BY_ID[activeBuildOrder.trackType]}</strong>
                  <span>{activeBuildOrder.turnsRemaining} turn(s) remaining</span>
                </div>
              </div>
            ) : (
              <p className="queue-empty">No active upgrade in this county.</p>
            )}
          </div>

          <div className="development-block">
            <p className="development-subheading">Queued</p>
            {queuedBuildOrders.length > 0 ? (
              <ul className="queue-list">
                {queuedBuildOrders.map((order, queueIndex) => (
                  <li className="queue-item" key={order.id}>
                    <div>
                      <strong>{TRACK_LABEL_BY_ID[order.trackType]}</strong>
                      <span>{order.turnsRemaining} turn(s)</span>
                    </div>
                    <button
                      className="secondary-button queue-remove-button"
                      onClick={() => onRemoveQueuedBuildOrder(queueIndex)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">No queued upgrades for this county.</p>
            )}
          </div>
        </section>
      )}

      <section className="drawer-section macro-panel-actions">
        <button className="macro-end-turn-button" onClick={onEndTurn} type="button">
          End Turn
        </button>
      </section>
    </aside>
  )
}
