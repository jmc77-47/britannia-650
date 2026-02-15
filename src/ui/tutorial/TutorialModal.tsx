import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Modal } from '../../components/Modal'
import { getLeader, type LeaderId } from '../../data/leaders'
import { assetUrl } from '../../lib/assetUrl'
import { TUTORIAL_STEPS } from './tutorialSteps'

interface TutorialModalProps {
  open: boolean
  leaderId: LeaderId
  onComplete: () => void
}

const SCOTT_SKIP_LINE =
  'Understood, m’lord. Scott is led away for immediate execution. Efficient governance!'
const SCOTT_FINISH_LINE =
  'Splendid, m’lord. Tutorial duties complete. Scott now reports to the courtyard for immediate ceremonial execution. Paperwork truly is faster this way!'

type TutorialAcknowledgementMode = 'none' | 'skip' | 'finish'

export function TutorialModal({
  open,
  leaderId,
  onComplete,
}: TutorialModalProps): React.JSX.Element | null {
  const [stepIndex, setStepIndex] = useState(0)
  const [acknowledgementMode, setAcknowledgementMode] =
    useState<TutorialAcknowledgementMode>('none')
  const titleId = useId()
  const primaryActionRef = useRef<HTMLButtonElement | null>(null)
  const leader = useMemo(() => getLeader(leaderId), [leaderId])
  const toAssetUrl = useMemo(() => assetUrl(import.meta.env.BASE_URL), [])
  const currentStep = TUTORIAL_STEPS[stepIndex]
  const totalSteps = TUTORIAL_STEPS.length
  const isAcknowledgementVisible = acknowledgementMode !== 'none'

  useEffect(() => {
    if (!open) {
      return
    }
    setStepIndex(0)
    setAcknowledgementMode('none')
  }, [leaderId, open])

  if (!open) {
    return null
  }

  return (
    <Modal
      initialFocusRef={primaryActionRef}
      labelledBy={titleId}
      onClose={() => setAcknowledgementMode('skip')}
      open={open}
      surfaceClassName="tutorial-modal-surface"
    >
      <section className="tutorial-modal">
        <div className="tutorial-layout">
          <figure className="tutorial-portrait">
            <img
              alt="Snivellin' Scott the Peasant"
              className="tutorial-portrait-image"
              src={toAssetUrl('assets/tutorial/scott_card.png')}
            />
          </figure>

          <div className="tutorial-content">
            {!isAcknowledgementVisible ? (
              <>
                <header className="tutorial-header">
                  <p className="hud-eyebrow">Snivellin&apos; Scott the Peasant</p>
                  <h2 id={titleId}>{currentStep.title}</h2>
                  <p className="subtle">
                    Scott serves <strong>{leader.name}</strong> of the{' '}
                    <strong>{leader.faction}</strong>, m&apos;lord.
                  </p>
                  <p className="tutorial-step-counter">
                    Step {stepIndex + 1} of {totalSteps}
                  </p>
                </header>

                <div className="tutorial-body-scroll">
                  <ul className="tutorial-bullets">
                    {currentStep.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>

                <footer className="tutorial-actions">
                  <button
                    className="secondary-button"
                    disabled={stepIndex === 0}
                    onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                    type="button"
                  >
                    Back
                  </button>

                  <div className="tutorial-actions-right">
                    <button
                      className="secondary-button"
                      onClick={() => setAcknowledgementMode('skip')}
                      type="button"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => {
                        if (stepIndex >= totalSteps - 1) {
                          setAcknowledgementMode('finish')
                          return
                        }
                        setStepIndex((current) => current + 1)
                      }}
                      ref={primaryActionRef}
                      type="button"
                    >
                      {stepIndex >= totalSteps - 1 ? 'Finish' : 'Next'}
                    </button>
                  </div>
                </footer>
              </>
            ) : (
              <>
                <header className="tutorial-header">
                  <p className="hud-eyebrow">Final Petition, m&apos;lord</p>
                  <h2 id={titleId}>
                    {acknowledgementMode === 'skip'
                      ? 'Scott Understands Perfectly'
                      : 'Tutorial Complete'}
                  </h2>
                </header>
                <div className="tutorial-body-scroll">
                  <p className="tutorial-skip-line">
                    {acknowledgementMode === 'skip'
                      ? SCOTT_SKIP_LINE
                      : SCOTT_FINISH_LINE}
                  </p>
                </div>
                <footer className="tutorial-actions">
                  <span className="subtle">Your campaign will begin at once.</span>
                  <button onClick={onComplete} ref={primaryActionRef} type="button">
                    Proceed
                  </button>
                </footer>
              </>
            )}
          </div>
        </div>
      </section>
    </Modal>
  )
}
