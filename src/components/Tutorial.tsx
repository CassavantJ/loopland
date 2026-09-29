import { Check, X } from 'lucide-react';
import { useEffect, useEffectEvent } from 'react';

import type { Selection } from '../game/tools';
import { STEPS, type TutorialState } from '../game/tutorial';
import type { World } from '../sim/world';
import styles from './Tutorial.module.css';

/**
 * The tutorial card: the current step, whether it's done, and Next or Skip. Steps with a
 * goal move on by themselves shortly after the player does it.
 */
export function Tutorial({
  world,
  state,
  selection,
  touch,
  onNext,
  onClose,
}: {
  world: World;
  state: TutorialState;
  selection: Selection;
  touch: boolean;
  onNext: () => void;
  onClose: (finished: boolean) => void;
}) {
  const step = STEPS[state.step];
  const last = state.step === STEPS.length - 1;
  const done = step?.done ? step.done({ world, selection, baseline: state.baseline }) : false;
  const advance = useEffectEvent(() => {
    onNext();
  });
  useEffect(() => {
    if (!done || last) return;
    // A moment to see the tick before moving on.
    const timer = window.setTimeout(() => {
      advance();
    }, 1200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [done, last, state.step]);
  if (!step) return null;
  return (
    <section className={styles.card} aria-labelledby="tutorial-title" data-done={done || undefined}>
      <header className={styles.header}>
        <span className={styles.count}>
          Tutorial · {state.step + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          className={styles.close}
          aria-label="Skip the tutorial"
          title="Skip the tutorial"
          onClick={() => {
            onClose(false);
          }}
        >
          <X aria-hidden="true" />
        </button>
      </header>
      <h2 id="tutorial-title" className={styles.title}>
        {done && <Check aria-hidden="true" className={styles.tick} />}
        {step.title}
      </h2>
      <p className={styles.text} aria-live="polite">
        {touch ? (step.touchText ?? step.text) : step.text}
      </p>
      <div className={styles.actions}>
        {step.done && !done ? (
          <span className={styles.waiting}>Waiting for you…</span>
        ) : last ? (
          <button
            type="button"
            className={styles.next}
            onClick={() => {
              onClose(true);
            }}
          >
            Start playing
          </button>
        ) : (
          <button type="button" className={styles.next} onClick={onNext}>
            {done ? 'Nice! Next' : 'Next'}
          </button>
        )}
        {step.done && !done && (
          <button type="button" className={styles.skip} onClick={onNext}>
            Skip this step
          </button>
        )}
      </div>
    </section>
  );
}
