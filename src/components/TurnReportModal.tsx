import { useId, useRef } from 'react'
import { getNonZeroResourceDeltaEntries } from '../game/economy'
import type { TurnReport } from '../game/state'
import { Modal } from './Modal'

interface TurnReportModalProps {
  report: TurnReport | null
  onClose: () => void
}

const formatSignedValue = (value: number): string => (value > 0 ? `+${value}` : `${value}`)

export function TurnReportModal({ report, onClose }: TurnReportModalProps) {
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  if (!report) {
    return null
  }

  const resourceEntries = getNonZeroResourceDeltaEntries(report.resourceDeltas)

  return (
    <Modal
      initialFocusRef={closeButtonRef}
      labelledBy={titleId}
      onClose={onClose}
      open
    >
      <section className="turn-report-modal">
        <header className="turn-report-header">
          <h2 id={titleId}>Turn Report</h2>
          <button
            aria-label="Close turn report"
            className="icon-close-button secondary-button"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="turn-report-body">
          <p className="turn-report-turn">
            Turn <strong>{report.turnNumber}</strong>
          </p>

          <section className="turn-report-section">
            <h3>Resource Deltas</h3>
            {resourceEntries.length > 0 ? (
              <ul className="turn-report-deltas">
                {resourceEntries.map((entry) => (
                  <li key={`turn-delta-${entry.key}`}>
                    <span>{entry.label}</span>
                    <strong>{formatSignedValue(entry.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queue-empty">No resource changes this turn.</p>
            )}
          </section>

          {report.topContributions.length > 0 && (
            <section className="turn-report-section">
              <h3>Top Contributors</h3>
              <ul className="turn-report-contributors">
                {report.topContributions.map((line, index) => (
                  <li key={`turn-contrib-${index}`}>{line}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="turn-report-actions">
          <button onClick={onClose} type="button">
            Close
          </button>
        </footer>
      </section>
    </Modal>
  )
}
