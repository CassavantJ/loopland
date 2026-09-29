import { Menu, Pause, Play, Target, Users } from 'lucide-react';
import { useState } from 'react';

import { money } from '../sim/catalog';
import type { Message } from '../sim/park';
import { objectiveStatus } from '../sim/scenarios';
import type { World } from '../sim/world';
import styles from './Game.module.css';

const SPEEDS = [
  { value: 0, label: 'Pause', icon: <Pause aria-hidden="true" /> },
  { value: 1, label: 'Normal speed', icon: <Play aria-hidden="true" /> },
  { value: 2, label: 'Fast', icon: <span aria-hidden="true">▸▸</span> },
  { value: 4, label: 'Fastest', icon: <span aria-hidden="true">▸▸▸</span> },
];

/** The bar across the top: money, guests, rating, the date, and the speed. */
export function Hud({
  world,
  speed,
  onSpeed,
  onMenu,
  onMessage,
  onGoal,
  quiet,
}: {
  world: World;
  speed: number;
  onSpeed: (speed: number) => void;
  onMenu: () => void;
  onMessage: (message: Message) => void;
  onGoal: () => void;
  /** Hide the news ticker (the tutorial sits where it would be). */
  quiet: boolean;
}) {
  const goal = world.park.objective.kind === 'none' ? null : objectiveStatus(world);
  const park = world.park;
  const latest = park.messages.at(-1);
  const [seen, setSeen] = useState(0);
  const fresh = latest && park.messages.length > seen && park.day - latest.day < 3 ? latest : null;
  return (
    <>
      <header className={styles.hud}>
        <div className={styles.stat} title="Money">
          <strong data-negative={park.money < 0 || undefined}>{money(park.money)}</strong>
        </div>
        <div className={styles.stat} title="Guests in the park">
          <Users aria-hidden="true" />
          <span>
            <span className="sr-only">Guests: </span>
            {world.inPark}
          </span>
        </div>
        <div className={styles.stat} title="Park rating, out of 999">
          <span className={styles.ratingBar} aria-hidden="true">
            <span style={{ width: `${(park.rating / 999) * 100}%` }} />
          </span>
          <span>
            <span className="sr-only">Park rating: </span>
            {park.rating}
          </span>
        </div>
        <div className={`${styles.stat} ${styles.date}`}>{park.date}</div>
        {goal && (
          <button
            type="button"
            className={`${styles.stat} ${styles.goal}`}
            title={goal.progress}
            data-outcome={park.outcome}
            onClick={onGoal}
          >
            <Target aria-hidden="true" />
            <span className={styles.ratingBar} aria-hidden="true">
              <span style={{ width: `${goal.fraction * 100}%` }} />
            </span>
            <span>
              {park.outcome === 'won'
                ? 'Goal met!'
                : park.outcome === 'lost'
                  ? 'Time’s up'
                  : `Goal ${Math.floor(goal.fraction * 100)}%`}
            </span>
          </button>
        )}
        <div className={styles.speeds} role="group" aria-label="Game speed">
          {SPEEDS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              title={option.label}
              aria-pressed={speed === option.value}
              onClick={() => {
                onSpeed(option.value);
              }}
            >
              {option.icon}
            </button>
          ))}
        </div>
        <button type="button" className={styles.menuButton} aria-label="Menu" onClick={onMenu}>
          <Menu aria-hidden="true" />
        </button>
      </header>
      {fresh && !quiet && (
        <button
          type="button"
          className={styles.ticker}
          onClick={() => {
            setSeen(park.messages.length);
            onMessage(fresh);
          }}
        >
          {fresh.text}
        </button>
      )}
    </>
  );
}
