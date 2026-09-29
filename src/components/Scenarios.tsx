import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { loadProgress } from '../game/save';
import { tutorialDone } from '../game/tutorial';
import { money } from '../sim/catalog';
import { describeObjective, SCENARIOS, startingRides, type ScenarioDef } from '../sim/scenarios';
import styles from './Scenarios.module.css';

/** Pick a park to build: the scenarios, easiest first, and the sandbox. */
export function ScenarioPicker({
  current,
  onStart,
  onClose,
}: {
  /** The scenario being played, if any: starting another replaces it. */
  current: string | null;
  onStart: (def: ScenarioDef, tutorial?: boolean) => void;
  /** Null when there's nothing to go back to. */
  onClose: (() => void) | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<ScenarioDef>(SCENARIOS[0] ?? ({} as ScenarioDef));
  const [completed] = useState(loadProgress);
  const [first] = useState(() => !tutorialDone());
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.picker}
      aria-labelledby="picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose?.();
      }}
    >
      <header className={styles.header}>
        <h2 id="picker-title">Choose a park</h2>
        {onClose && (
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        )}
      </header>
      {first && (
        <div className={styles.newcomer}>
          <p>
            <strong>New to Loopland?</strong> The tutorial walks you through building your first
            rides in Sunny Meadows. It takes a few minutes.
          </p>
          <button
            type="button"
            className={styles.start}
            onClick={() => {
              if (SCENARIOS[0]) onStart(SCENARIOS[0], true);
            }}
          >
            Start the tutorial
          </button>
        </div>
      )}
      <div className={styles.body}>
        <ul className={styles.list}>
          {SCENARIOS.map((def) => (
            <li key={def.id}>
              <button
                type="button"
                aria-pressed={chosen.id === def.id}
                onClick={() => {
                  setChosen(def);
                }}
              >
                <span className={styles.name}>
                  {def.name}
                  {completed.includes(def.id) && (
                    <Check aria-label="Completed" className={styles.done} />
                  )}
                </span>
                <span className={styles.badge} data-level={def.difficulty}>
                  {def.difficulty}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <section className={styles.detail} aria-live="polite">
          <h3>{chosen.name}</h3>
          <p>{chosen.blurb}</p>
          <p className={styles.goal}>
            <strong>Goal:</strong> {describeObjective(chosen.objective)}
          </p>
          <dl>
            <div>
              <dt>Money</dt>
              <dd>
                {money(chosen.money)}
                {chosen.loan > 0 ? ` (${money(chosen.loan)} of it borrowed)` : ''}
              </dd>
            </div>
            <div>
              <dt>Rides to start with</dt>
              <dd>{startingRides(chosen).join(', ')}</dd>
            </div>
            <div>
              <dt>Land</dt>
              <dd>
                {chosen.owned
                  ? `A small plot; more for sale at ${money(chosen.landPrice)} a tile`
                  : 'Plenty of room'}
              </dd>
            </div>
          </dl>
          {current && (
            <p className={styles.warn}>Starting a new park replaces the one you’re playing.</p>
          )}
          <button
            type="button"
            className={styles.start}
            onClick={() => {
              onStart(chosen);
            }}
          >
            Start {chosen.name}
          </button>
        </section>
      </div>
    </dialog>
  );
}

/** Won or lost: a message, and what to do next. */
export function OutcomeDialog({
  won,
  name,
  goal,
  onContinue,
  onRetry,
  onPick,
}: {
  won: boolean;
  name: string;
  goal: string;
  onContinue: () => void;
  onRetry: () => void;
  onPick: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.outcome}
      aria-labelledby="outcome-title"
      onCancel={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <h2 id="outcome-title">{won ? 'Scenario complete!' : 'Time’s up'}</h2>
      <p>
        {won
          ? `${name} met its goal. Brilliant park-building!`
          : `${name} didn’t quite make it. The goal was: ${goal}`}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.start} onClick={onContinue}>
          Keep playing
        </button>
        {!won && (
          <button type="button" className={styles.secondary} onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={onPick}>
          Choose another park
        </button>
      </div>
    </dialog>
  );
}
