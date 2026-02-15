export type MacroPanelTab = 'BUILD' | 'TROOPS' | 'RESEARCH' | 'POLICIES'

export interface MacroPanelCounty {
  id: string
  name: string
}

interface MacroPanelProps {
  turnNumber: number
  selectedCounty: MacroPanelCounty | null
  activeTab: MacroPanelTab
  onTabChange: (tab: MacroPanelTab) => void
  onEndTurn: () => void
}

const PANEL_TABS: { id: MacroPanelTab; label: string }[] = [
  { id: 'BUILD', label: 'Build' },
  { id: 'TROOPS', label: 'Troops' },
  { id: 'RESEARCH', label: 'Research' },
  { id: 'POLICIES', label: 'Policies' },
]

const STUB_COPY: Record<MacroPanelTab, string> = {
  BUILD: 'Construction queue integration lands in Milestone 2.',
  TROOPS: 'Troop muster and movement orders will plug in next.',
  RESEARCH: 'Realm research trees are scaffolded for a later milestone.',
  POLICIES: 'Policy toggles and realm laws are planned for later.',
}

export function MacroPanel({
  turnNumber,
  selectedCounty,
  activeTab,
  onTabChange,
  onEndTurn,
}: MacroPanelProps) {
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

      <section className="drawer-section macro-panel-actions">
        <button className="macro-end-turn-button" onClick={onEndTurn} type="button">
          End Turn
        </button>
      </section>
    </aside>
  )
}
