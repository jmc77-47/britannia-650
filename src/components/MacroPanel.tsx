import {
  BUILDING_DEFINITIONS,
  BUILDING_ORDER,
  type BuildingType,
  type ResourceDelta,
} from '../game/buildings'
import { getNonZeroResourceDeltaEntries } from '../game/economy'

export type MacroPanelTab = 'BUILD' | 'TROOPS' | 'RESEARCH' | 'POLICIES'

export interface MacroPanelCounty {
  id: string
  name: string
}

interface MacroPanelProps {
  turnNumber: number
  selectedCounty: MacroPanelCounty | null
  selectedCountyOwned: boolean
  selectedCountyBuildings: BuildingType[]
  selectedCountyDefense: number
  selectedCountyRoadLevel: number
  selectedCountyYields: ResourceDelta
  queuedBuildings: BuildingType[]
  canQueueByBuilding: Record<BuildingType, boolean>
  buildingCostLabels: Record<BuildingType, string>
  activeTab: MacroPanelTab
  onTabChange: (tab: MacroPanelTab) => void
  onQueueBuild: (buildingType: BuildingType) => void
  onRemoveQueuedBuild: (queueIndex: number) => void
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

export function MacroPanel({
  turnNumber,
  selectedCounty,
  selectedCountyOwned,
  selectedCountyBuildings,
  selectedCountyDefense,
  selectedCountyRoadLevel,
  selectedCountyYields,
  queuedBuildings,
  canQueueByBuilding,
  buildingCostLabels,
  activeTab,
  onTabChange,
  onQueueBuild,
  onRemoveQueuedBuild,
  onEndTurn,
}: MacroPanelProps) {
  const hasSelectedCounty = selectedCounty !== null
  const uniqueBuildingTypes = [...new Set(selectedCountyBuildings)]
  const selectedCountyYieldEntries = getNonZeroResourceDeltaEntries(selectedCountyYields)

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
            {uniqueBuildingTypes.length > 0 ? (
              uniqueBuildingTypes.map((buildingType) => (
                <span className="building-tag" key={`building-tag-${buildingType}`}>
                  {BUILDING_DEFINITIONS[buildingType].badge}
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
                <dd>Level {selectedCountyRoadLevel}</dd>
              </div>
              <div>
                <dt>Defense</dt>
                <dd>{selectedCountyDefense}</dd>
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
            <p className="development-subheading">Current buildings</p>
            {selectedCountyBuildings.length > 0 ? (
              <ul className="building-list">
                {selectedCountyBuildings.map((buildingType, index) => (
                  <li className="building-list-item" key={`${buildingType}-${index}`}>
                    <span className="building-list-name">
                      {BUILDING_DEFINITIONS[buildingType].label}
                    </span>
                    <span className="building-list-badge">
                      {BUILDING_DEFINITIONS[buildingType].badge}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">No completed buildings in this county.</p>
            )}
          </div>

          <div className="development-block">
            <p className="development-subheading">Queue construction</p>
            <div className="build-button-list">
              {BUILDING_ORDER.map((buildingType) => (
                <button
                  className="secondary-button build-action-button"
                  disabled={!selectedCountyOwned || !canQueueByBuilding[buildingType]}
                  key={buildingType}
                  onClick={() => onQueueBuild(buildingType)}
                  type="button"
                >
                  <span>{BUILDING_DEFINITIONS[buildingType].label}</span>
                  <small>{buildingCostLabels[buildingType]}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="development-block">
            <p className="development-subheading">Queued this turn</p>
            {queuedBuildings.length > 0 ? (
              <ul className="queue-list">
                {queuedBuildings.map((buildingType, queueIndex) => (
                  <li className="queue-item" key={`${buildingType}-queue-${queueIndex}`}>
                    <div>
                      <strong>{BUILDING_DEFINITIONS[buildingType].label}</strong>
                      <span>{BUILDING_DEFINITIONS[buildingType].badge}</span>
                    </div>
                    <button
                      className="secondary-button queue-remove-button"
                      onClick={() => onRemoveQueuedBuild(queueIndex)}
                      type="button"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">No build orders queued for this county.</p>
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
