import { useMemo, useState } from 'react'
import {
  MAX_TRACK_LEVEL,
  TRACK_LABEL_BY_ID,
  type BuildingType,
  type ResourceDelta,
  type StorableResourceKey,
  type UpgradeTrackType,
} from '../game/buildings'
import { getNonZeroResourceDeltaEntries } from '../game/economy'
import type { CountyBuildOrder } from '../game/state'

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

export interface StorageRiskEntry {
  key: StorableResourceKey
  current: number
  cap: number
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
  storageRiskEntries: StorageRiskEntry[]
  onQueueTrackUpgrade: (trackType: UpgradeTrackType) => void
  onQueueWarehouseUpgrade: () => void
  onRemoveQueuedBuildOrder: (queueIndex: number) => void
  onRemoveQueuedWarehouseOrder: (queueIndex: number) => void
  onEndTurn: () => void
}

type SectionId = 'overview' | 'build' | 'economy' | 'kingdom'
type BuildView = 'RECOMMENDED' | 'ALL'

interface Recommendation {
  key: string
  kind: 'county' | 'warehouse'
  reason: string
  trackType?: UpgradeTrackType
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

const TRACK_ICON_BY_TYPE: Record<UpgradeTrackType, string> = {
  FARM: '🌾',
  HOMESTEADS: '🏠',
  LUMBER_CAMP: '🪵',
  QUARRY: '🧱',
  MINE: '⛏️',
  PASTURE: '🐎',
  TANNERY: '🧴',
  WEAVERY: '🧶',
  MARKET: '🏛️',
  PALISADE: '🛡️',
  ROADS: '🛣️',
  WAREHOUSE: '📦',
}

const CATEGORY_GROUPS: Array<{ title: string; tracks: UpgradeTrackType[] }> = [
  { title: 'Growth', tracks: ['FARM', 'HOMESTEADS'] },
  { title: 'Income', tracks: ['MARKET'] },
  { title: 'Materials', tracks: ['LUMBER_CAMP', 'QUARRY'] },
  { title: 'Industry', tracks: ['MINE', 'WEAVERY', 'TANNERY', 'PASTURE'] },
  { title: 'Defense', tracks: ['PALISADE'] },
  { title: 'Infrastructure', tracks: ['ROADS'] },
]

const RESOURCE_LABEL_BY_KEY: Record<StorableResourceKey, string> = {
  gold: 'Gold',
  wood: 'Wood',
  stone: 'Stone',
  iron: 'Iron',
  wool: 'Wool',
  leather: 'Leather',
  horses: 'Horses',
}

const toCostChips = (costLabel: string): string[] => {
  if (costLabel === 'No cost' || costLabel === 'Max level reached') {
    return [costLabel]
  }

  return costLabel
    .split(' + ')
    .map((chip) => chip.trim())
    .filter((chip) => chip.length > 0)
}

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
  storageRiskEntries,
  onQueueTrackUpgrade,
  onQueueWarehouseUpgrade,
  onRemoveQueuedBuildOrder,
  onRemoveQueuedWarehouseOrder,
  onEndTurn,
}: MacroPanelProps) {
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    overview: true,
    build: true,
    economy: false,
    kingdom: false,
  })
  const [buildView, setBuildView] = useState<BuildView>('RECOMMENDED')
  const [showAllCaps, setShowAllCaps] = useState(false)

  const hasSelectedCounty = selectedCounty !== null
  const selectedCountyYieldEntries = getNonZeroResourceDeltaEntries(selectedCountyYields)
  const trackByType = useMemo(
    () => new Map(trackUpgradeOptions.map((track) => [track.trackType, track])),
    [trackUpgradeOptions],
  )

  const toggleSection = (sectionId: SectionId) => {
    setOpenSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }))
  }

  const activeOrderTrackLevel = (() => {
    if (!activeBuildOrder) {
      return 0
    }

    if (activeBuildOrder.trackType === 'ROADS') {
      return selectedCountyRoadLevel
    }

    if (activeBuildOrder.trackType === 'WAREHOUSE') {
      return warehouseLevel
    }

    return selectedCountyBuildingLevels[activeBuildOrder.trackType] ?? 0
  })()

  const workforceEfficiency =
    selectedCountyPopulationUsed <= 0
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            Math.round((selectedCountyPopulation / selectedCountyPopulationUsed) * 100),
          ),
        )

  const recommendations = useMemo<Recommendation[]>(() => {
    const items: Recommendation[] = []
    const seen = new Set<string>()

    const addTrackRecommendation = (trackType: UpgradeTrackType, reason: string) => {
      if (!trackByType.has(trackType)) {
        return
      }
      const key = `track-${trackType}`
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      items.push({
        key,
        kind: 'county',
        reason,
        trackType,
      })
    }

    const addWarehouseRecommendation = (reason: string) => {
      const key = 'warehouse'
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      items.push({
        key,
        kind: 'warehouse',
        reason,
      })
    }

    if (!hasSelectedCounty || !selectedCountyOwned) {
      return items
    }

    if (selectedCountySlotsUsed >= selectedCountySlotsCap) {
      addTrackRecommendation('MARKET', 'Slots are full; improve existing income tracks.')
      addTrackRecommendation('LUMBER_CAMP', 'Slots are full; strengthen existing material output.')
      addTrackRecommendation('FARM', 'Expand Farm to unlock more specialization slots.')
    }

    if (
      selectedCountyPopulationFree <= 0 ||
      selectedCountyPopulationUsed >= selectedCountyPopulation
    ) {
      addTrackRecommendation('FARM', 'Population is constrained; increase capacity.')
      addTrackRecommendation('HOMESTEADS', 'Homesteads improve population growth momentum.')
    }

    if ((selectedCountyYields.wood ?? 0) < 6) {
      addTrackRecommendation('LUMBER_CAMP', 'Wood income is low for early expansion.')
    }

    if ((selectedCountyYields.gold ?? 0) < 8) {
      addTrackRecommendation('MARKET', 'Gold income is low for sustained upgrades.')
    }

    if ((selectedCountyYields.iron ?? 0) <= 0) {
      addTrackRecommendation('MINE', 'Add iron output for military and industry lines.')
    }

    if (storageRiskEntries.length > 0) {
      addWarehouseRecommendation('Storage is nearing cap; expand Warehouse.')
    }

    trackUpgradeOptions
      .filter((track) => track.canUpgrade && track.trackType !== 'ROADS')
      .slice(0, 4)
      .forEach((track) => {
        addTrackRecommendation(track.trackType, 'Low-friction upgrade available now.')
      })

    return items.slice(0, 6)
  }, [
    hasSelectedCounty,
    selectedCountyOwned,
    selectedCountyPopulation,
    selectedCountyPopulationFree,
    selectedCountyPopulationUsed,
    selectedCountySlotsCap,
    selectedCountySlotsUsed,
    selectedCountyYields.gold,
    selectedCountyYields.iron,
    selectedCountyYields.wood,
    storageRiskEntries.length,
    trackByType,
    trackUpgradeOptions,
  ])

  const groupedTracks = useMemo(
    () =>
      CATEGORY_GROUPS.map((group) => ({
        title: group.title,
        tracks: group.tracks
          .map((trackType) => trackByType.get(trackType))
          .filter((track): track is TrackUpgradeOption => !!track),
      })).filter((group) => group.tracks.length > 0),
    [trackByType],
  )

  const visibleCapEntries = showAllCaps
    ? STORAGE_CAP_ORDER
    : STORAGE_CAP_ORDER.filter((entry) => ['gold', 'wood', 'stone'].includes(entry.key))

  const renderTrackRow = (track: TrackUpgradeOption, badgeText?: string) => {
    const nextLevel = Math.min(MAX_TRACK_LEVEL, track.level + 1)
    const costChips = toCostChips(track.costLabel)

    return (
      <li className="upgrade-card" key={`track-card-${track.trackType}-${badgeText ?? 'all'}`}>
        <div className="upgrade-card-main">
          <div className="upgrade-card-icon" aria-hidden="true">
            {TRACK_ICON_BY_TYPE[track.trackType]}
          </div>
          <div className="upgrade-card-copy">
            <p className="upgrade-card-title">
              <strong>{track.label}</strong>{' '}
              <span className="stats-muted">
                L{track.level} → L{nextLevel}
              </span>
            </p>
            {badgeText && <p className="upgrade-card-reason">{badgeText}</p>}
            <p className="upgrade-card-subtle">{track.yieldLabel}</p>
            <p className="upgrade-card-subtle">{track.populationImpactLabel}</p>
            {!track.canUpgrade && track.disabledReason && (
              <p className="upgrade-disabled-reason">{track.disabledReason}</p>
            )}
          </div>
        </div>

        <div className="upgrade-card-actions">
          <div className="upgrade-card-chips">
            {costChips.map((chip) => (
              <span className="upgrade-chip" key={`${track.trackType}-chip-${chip}`}>
                {chip}
              </span>
            ))}
            <span className="upgrade-chip is-turns">
              {track.turnsRequired} turn{track.turnsRequired === 1 ? '' : 's'}
            </span>
          </div>
          <button
            className="secondary-button queue-remove-button"
            disabled={!track.canUpgrade}
            onClick={() => onQueueTrackUpgrade(track.trackType)}
            type="button"
          >
            Upgrade
          </button>
        </div>
      </li>
    )
  }

  const renderWarehouseRow = (badgeText?: string) => {
    const costChips = toCostChips(warehouseUpgradeCostLabel)

    return (
      <li className="upgrade-card" key={`warehouse-card-${badgeText ?? 'base'}`}>
        <div className="upgrade-card-main">
          <div className="upgrade-card-icon" aria-hidden="true">
            {TRACK_ICON_BY_TYPE.WAREHOUSE}
          </div>
          <div className="upgrade-card-copy">
            <p className="upgrade-card-title">
              <strong>Warehouse</strong>{' '}
              <span className="stats-muted">
                L{warehouseLevel} → L{Math.min(MAX_TRACK_LEVEL, warehouseLevel + 1)}
              </span>
            </p>
            {badgeText && <p className="upgrade-card-reason">{badgeText}</p>}
            <p className="upgrade-card-subtle">Expands storage caps across the kingdom.</p>
            {!warehouseCanUpgrade && warehouseUpgradeDisabledReason && (
              <p className="upgrade-disabled-reason">{warehouseUpgradeDisabledReason}</p>
            )}
          </div>
        </div>

        <div className="upgrade-card-actions">
          <div className="upgrade-card-chips">
            {costChips.map((chip) => (
              <span className="upgrade-chip" key={`warehouse-chip-${chip}`}>
                {chip}
              </span>
            ))}
            <span className="upgrade-chip is-turns">
              {warehouseUpgradeTurns} turn{warehouseUpgradeTurns === 1 ? '' : 's'}
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
      </li>
    )
  }

  return (
    <aside className="HudPanel MacroPanel" aria-label="Macro controls">
      <section className="drawer-section macro-panel-header">
        <h2>Macro Command</h2>
        <p className="macro-panel-turn">
          Turn #: <strong>{turnNumber}</strong>
        </p>
      </section>

      <section className="drawer-section development-section premium-section">
        <button
          aria-expanded={openSections.overview}
          className="section-toggle"
          onClick={() => toggleSection('overview')}
          type="button"
        >
          <span>County Overview</span>
          <span>{openSections.overview ? '−' : '+'}</span>
        </button>

        {openSections.overview && (
          <div className="panel-section-body">
            <div className="development-header">
              <h3>
                {selectedCounty ? (
                  <>
                    {selectedCounty.name} <span className="county-code">{selectedCounty.id}</span>
                  </>
                ) : (
                  'No County Selected'
                )}
              </h3>
              <span
                className={`ownership-pill${selectedCountyOwned ? ' is-owned' : ' is-foreign'}`}
              >
                {selectedCountyOwned ? 'Owned' : 'Not owned'}
              </span>
            </div>

            <dl className="overview-grid">
              <div>
                <dt>Population</dt>
                <dd>{selectedCountyPopulation} / {selectedCountyPopulationCap}</dd>
              </div>
              <div>
                <dt>Workers</dt>
                <dd>{selectedCountyPopulationUsed} / {selectedCountyPopulationFree}</dd>
              </div>
              <div>
                <dt>Slots</dt>
                <dd>{selectedCountySlotsUsed} / {selectedCountySlotsCap}</dd>
              </div>
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
                <dt>Queue</dt>
                <dd>{queuedBuildOrders.length > 0 ? `Queue: ${queuedBuildOrders.length}` : 'Queue: 0'}</dd>
              </div>
            </dl>

            <div className="overview-inline-note">
              {activeBuildOrder ? (
                <span>
                  Active: {TRACK_LABEL_BY_ID[activeBuildOrder.trackType]} L{activeOrderTrackLevel} → L{Math.min(MAX_TRACK_LEVEL, activeOrderTrackLevel + 1)} ({activeBuildOrder.turnsRemaining} turn{activeBuildOrder.turnsRemaining === 1 ? '' : 's'} left)
                </span>
              ) : (
                <span>No active county build.</span>
              )}
            </div>
            <p className="overview-hint subtle">Press Enter to end turn.</p>
          </div>
        )}
      </section>

      <section className="drawer-section development-section premium-section">
        <button
          aria-expanded={openSections.build}
          className="section-toggle"
          onClick={() => toggleSection('build')}
          type="button"
        >
          <span>Build & Upgrade</span>
          <span>{openSections.build ? '−' : '+'}</span>
        </button>

        {openSections.build && (
          <div className="panel-section-body">
            <div className="build-tab-list" role="tablist" aria-label="Build view tabs">
              <button
                aria-selected={buildView === 'RECOMMENDED'}
                className={`secondary-button build-tab-button${buildView === 'RECOMMENDED' ? ' is-active' : ''}`}
                onClick={() => setBuildView('RECOMMENDED')}
                role="tab"
                type="button"
              >
                Recommended
              </button>
              <button
                aria-selected={buildView === 'ALL'}
                className={`secondary-button build-tab-button${buildView === 'ALL' ? ' is-active' : ''}`}
                onClick={() => setBuildView('ALL')}
                role="tab"
                type="button"
              >
                All
              </button>
            </div>

            {buildView === 'RECOMMENDED' ? (
              !hasSelectedCounty || !selectedCountyOwned ? (
                <p className="queue-empty">Select an owned county to build.</p>
              ) : recommendations.length === 0 ? (
                <p className="queue-empty">No high-priority recommendation right now.</p>
              ) : (
                <ul className="upgrade-card-list">
                  {recommendations.map((recommendation) => {
                    if (recommendation.kind === 'warehouse') {
                      return renderWarehouseRow(recommendation.reason)
                    }

                    const recommendationTrack = recommendation.trackType
                      ? trackByType.get(recommendation.trackType)
                      : undefined
                    if (!recommendationTrack) {
                      return null
                    }

                    return renderTrackRow(recommendationTrack, recommendation.reason)
                  })}
                </ul>
              )
            ) : !hasSelectedCounty || !selectedCountyOwned ? (
              <p className="queue-empty">Select an owned county to view full build tracks.</p>
            ) : (
              <div className="all-tracks-groups">
                {groupedTracks.map((group) => (
                  <section className="track-group" key={`track-group-${group.title}`}>
                    <h4>{group.title}</h4>
                    <ul className="upgrade-card-list compact">
                      {group.tracks.map((track) => renderTrackRow(track))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <div className="development-block queue-block-compact">
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
                <p className="queue-empty">No queued county upgrades.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="drawer-section development-section premium-section">
        <button
          aria-expanded={openSections.economy}
          className="section-toggle"
          onClick={() => toggleSection('economy')}
          type="button"
        >
          <span>Economy</span>
          <span>{openSections.economy ? '−' : '+'}</span>
        </button>

        {openSections.economy && (
          <div className="panel-section-body">
            <div className="development-block queue-block-compact">
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

            <div className="development-block queue-block-compact">
              <p className="development-subheading">Multipliers</p>
              <p className="subtle">Workforce efficiency: <strong>{workforceEfficiency}%</strong></p>
              <p className="subtle">Milestones: bonuses apply at L5/L10/L15/L20 per track.</p>
            </div>

            <div className="development-block queue-block-compact">
              <p className="development-subheading">Storage risk</p>
              {storageRiskEntries.length > 0 ? (
                <ul className="risk-list">
                  {storageRiskEntries.map((risk) => (
                    <li key={`risk-${risk.key}`}>
                      <span>{RESOURCE_LABEL_BY_KEY[risk.key]}</span>
                      <strong>{risk.current}/{risk.cap}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="subtle">No storage pressure right now.</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="drawer-section development-section premium-section">
        <button
          aria-expanded={openSections.kingdom}
          className="section-toggle"
          onClick={() => toggleSection('kingdom')}
          type="button"
        >
          <span>Kingdom</span>
          <span>{openSections.kingdom ? '−' : '+'}</span>
        </button>

        {openSections.kingdom && (
          <div className="panel-section-body">
            <div className="development-header">
              <h3>Warehouse</h3>
              <span className="building-tag">L{warehouseLevel}/{MAX_TRACK_LEVEL}</span>
            </div>

            <div className="development-block queue-block-compact">
              <p className="development-subheading">Key caps</p>
              <ul className="storage-cap-list">
                {visibleCapEntries.map((entry) => (
                  <li key={`warehouse-cap-${entry.key}`}>
                    <span>{entry.label}</span>
                    <strong>{warehouseCaps[entry.key]}</strong>
                  </li>
                ))}
              </ul>
              <button
                className="secondary-button inline-toggle-button"
                onClick={() => setShowAllCaps((current) => !current)}
                type="button"
              >
                {showAllCaps ? 'View key caps only' : 'View all caps'}
              </button>
            </div>

            <ul className="upgrade-card-list">{renderWarehouseRow()}</ul>

            <div className="development-block queue-block-compact">
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
          </div>
        )}
      </section>

      <section className="drawer-section macro-panel-actions">
        <button className="macro-end-turn-button" onClick={onEndTurn} type="button">
          End Turn
        </button>
      </section>
    </aside>
  )
}
