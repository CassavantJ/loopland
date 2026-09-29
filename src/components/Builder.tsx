import { Link2, Undo2, Wand2 } from 'lucide-react';
import { useState } from 'react';

import { money, RIDE_TYPES } from '../sim/catalog';
import { kmh, METRES_PER_TILE } from '../sim/coaster';
import {
  appendCheck,
  appendPiece,
  buildDesign,
  nextPieces,
  pieceCost,
  removeLastPiece,
  STATION_LENGTH,
  trackEnd,
} from '../sim/coasters';
import type { Ride } from '../sim/park';
import { PIECES, type PieceId, type Placed } from '../sim/track';
import type { World } from '../sim/world';
import styles from './Game.module.css';

export type GhostHandler = (ghost: { placed: Placed; ok: boolean } | null) => void;

const GROUPS: { title: string; ids: PieceId[] }[] = [
  {
    title: 'Straight and turns',
    ids: ['left-1', 'left-2', 'left-3', 'straight', 'right-3', 'right-2', 'right-1'],
  },
  { title: 'Banked turns', ids: ['bank-left-2', 'bank-left-3', 'bank-right-3', 'bank-right-2'] },
  {
    title: 'Hills',
    ids: [
      'flat-to-up25',
      'up25-to-up60',
      'up60-to-up25',
      'up25-to-flat',
      'flat-to-down25',
      'down25-to-down60',
      'down60-to-down25',
      'down25-to-flat',
    ],
  },
  { title: 'Special', ids: ['loop-left', 'loop', 'brakes', 'booster'] },
];

const SLOPE_NAMES = {
  flat: 'level',
  up25: 'climbing',
  up60: 'climbing steeply',
  down25: 'dropping',
  down60: 'dropping steeply',
};

/** Piece-by-piece track building for a coaster that isn't finished yet. */
export function TrackBuilder({
  world,
  ride,
  onGhost,
}: {
  world: World;
  ride: Ride;
  onGhost: GhostHandler;
}) {
  const park = world.park;
  const coaster = ride.coaster;
  const [chain, setChain] = useState(false);
  const [message, setMessage] = useState('');
  const [, refresh] = useState(0);
  if (!coaster) return null;
  const end = trackEnd(coaster);
  const offered = new Set(nextPieces(ride));
  const extra = coaster.pieces.length - STATION_LENGTH;
  const ground = Math.max(
    ...park.terrain.tileCorners(
      Math.min(park.width - 1, Math.max(0, end.x)),
      Math.min(park.depth - 1, Math.max(0, end.z)),
    ),
  );
  const heightAbove = ((end.h - ground) * 0.25 * METRES_PER_TILE).toFixed(1);
  const done = () => {
    refresh((value) => value + 1);
    onGhost(null);
  };

  return (
    <div className={styles.builder}>
      <p className={styles.small}>
        Build from the station and bring the track back round into it. The track now heads{' '}
        {['north', 'east', 'south', 'west'][end.dir]}, {SLOPE_NAMES[end.slope]}, {heightAbove} m up.
      </p>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={chain}
          onClick={() => {
            setChain(!chain);
          }}
        >
          <Link2 aria-hidden="true" /> Chain lift
        </button>
        <button
          type="button"
          className={styles.toggle}
          disabled={extra === 0}
          onClick={() => {
            removeLastPiece(park, ride);
            setMessage('');
            done();
          }}
        >
          <Undo2 aria-hidden="true" /> Undo
        </button>
      </div>
      {GROUPS.map((group) => {
        const ids = group.ids.filter((id) => offered.has(id));
        if (ids.length === 0) return null;
        return (
          <div key={group.title}>
            <h3 className={styles.subhead}>{group.title}</h3>
            <div className={styles.pieces}>
              {ids.map((id) => {
                const useChain = chain && PIECES[id].liftable && !end.slope.startsWith('down');
                const check = appendCheck(park, ride, id, useChain);
                return (
                  <button
                    key={id}
                    type="button"
                    className={styles.piece}
                    aria-disabled={!check.ok}
                    title={
                      check.ok
                        ? `${PIECES[id].label}: ${money(pieceCost(id, useChain))}`
                        : check.reason
                    }
                    onPointerEnter={() => {
                      onGhost({ placed: { id, chain: useChain, start: end }, ok: check.ok });
                    }}
                    onPointerLeave={() => {
                      onGhost(null);
                    }}
                    onFocus={() => {
                      onGhost({ placed: { id, chain: useChain, start: end }, ok: check.ok });
                    }}
                    onBlur={() => {
                      onGhost(null);
                    }}
                    onClick={() => {
                      if (!check.ok) {
                        setMessage(check.reason);
                        return;
                      }
                      appendPiece(park, ride, id, useChain);
                      setMessage(coaster.complete ? 'Circuit complete!' : '');
                      done();
                    }}
                  >
                    <PieceIcon id={id} />
                    <span>{PIECES[id].label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className={styles.note2} role="status">
        {message}
      </p>
      {extra === 0 && RIDE_TYPES[ride.type].design && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => {
            const result = buildDesign(park, ride);
            setMessage(result.ok ? 'Built the ready-made layout.' : result.reason);
            done();
          }}
        >
          <Wand2 aria-hidden="true" /> Build a ready-made layout
        </button>
      )}
    </div>
  );
}

const SIDE_VIEW: Partial<Record<PieceId, string>> = {
  'flat-to-up25': 'M3 17 H9 Q15 17 21 11',
  'up25-to-flat': 'M3 17 Q9 11 15 11 H21',
  'up25-to-up60': 'M3 20 L9 16 Q14 13 17 3',
  'up60-to-up25': 'M7 21 Q10 11 15 8 L21 5',
  'flat-to-down25': 'M3 7 H9 Q15 7 21 13',
  'down25-to-flat': 'M3 7 Q9 13 15 13 H21',
  'down25-to-down60': 'M3 4 L9 8 Q14 11 17 21',
  'down60-to-down25': 'M7 3 Q10 13 15 16 L21 19',
  loop: 'M3 20 H9 A5 5 0 1 1 15 20 H21',
  'loop-left': 'M3 20 H9 A5 5 0 1 1 15 20 H21',
  brakes: 'M12 21 V3 M7 9 H17 M7 15 H17',
  booster: 'M12 21 V3 M7 12 L12 7 L17 12',
};

/** A tiny diagram of each piece: turns from above, hills from the side. */
function PieceIcon({ id }: { id: PieceId }) {
  const spec = PIECES[id];
  let path = SIDE_VIEW[id] ?? 'M12 21 V3';
  if (spec.turn !== 0) {
    const r = spec.size === 1 ? 6 : spec.size === 2 ? 10 : 14;
    const side = spec.turn;
    path = `M12 21 V${3 + r} A${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${12 + side * r} 3`;
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.pieceIcon}>
      <path d={path} />
      {spec.bank !== 0 && <path d="M5 21 L19 18" className={styles.bankLine} />}
    </svg>
  );
}

/** Test-run results and controls for a finished coaster. */
export function CoasterResults({ world, ride }: { world: World; ride: Ride }) {
  const park = world.park;
  const coaster = ride.coaster;
  const [, refresh] = useState(0);
  if (!coaster) return null;
  const stats = coaster.stats;
  return (
    <>
      {coaster.problem && (
        <div className={styles.warning}>
          <p>{coaster.problem}</p>
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              removeLastPiece(park, ride);
              refresh((value) => value + 1);
            }}
          >
            Undo the last piece to change the layout
          </button>
        </div>
      )}
      {stats && !ride.open && (
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => {
            world.setOpen(ride, true);
            refresh((value) => value + 1);
          }}
        >
          Open {ride.name}
        </button>
      )}
      {stats && (
        <dl className={styles.stats}>
          <div>
            <dt>Top speed</dt>
            <dd>{kmh(stats.maxSpeed).toFixed(0)} km/h</dd>
          </div>
          <div>
            <dt>Biggest drop</dt>
            <dd>{(stats.highestDrop * METRES_PER_TILE).toFixed(1)} m</dd>
          </div>
          <div>
            <dt>Drops · inversions</dt>
            <dd>
              {stats.drops} · {stats.inversions}
            </dd>
          </div>
          <div>
            <dt>Max G (up / sideways)</dt>
            <dd>
              {stats.maxVerticalG.toFixed(2)} / {stats.maxLateralG.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt>Airtime</dt>
            <dd>{stats.airtime.toFixed(1)} s</dd>
          </div>
          <div>
            <dt>Ride time · length</dt>
            <dd>
              {stats.duration.toFixed(0)} s · {(stats.length * METRES_PER_TILE).toFixed(0)} m
            </dd>
          </div>
        </dl>
      )}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          disabled={ride.phase === 'running'}
          onClick={() => {
            world.testDrive(ride);
          }}
        >
          Watch a test run
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            removeLastPiece(park, ride);
            refresh((value) => value + 1);
          }}
        >
          Change the track…
        </button>
      </div>
    </>
  );
}
