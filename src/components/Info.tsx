import {
  FaceAngry,
  FaceGrinning,
  FaceNeutral,
  FaceSlightlyFrowning,
  FaceSlightlySmiling,
  Minus,
  Plus,
} from 'lucide-react';
import { useState } from 'react';

import { money, RIDE_TYPES } from '../sim/catalog';
import { fairPrice, ratingsOf, type Guest } from '../sim/guests';
import { DAY_SECONDS, type Ride } from '../sim/park';
import type { World } from '../sim/world';
import { CoasterResults, TrackBuilder, type GhostHandler } from './Builder';
import styles from './Game.module.css';

function Bar({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <div className={styles.bar}>
      <span>{label}</span>
      <meter
        min={0}
        max={1}
        low={0.34}
        high={0.67}
        optimum={tone === 'bad' ? 0 : 1}
        value={value}
        aria-label={label}
      />
    </div>
  );
}

const level = (value: number) =>
  value < 3 ? 'low' : value < 6 ? 'medium' : value < 8 ? 'high' : 'very high';

export function RideInfo({
  world,
  ride,
  onFocus,
  onClosePanel,
  onGhost,
}: {
  world: World;
  ride: Ride;
  onFocus: (x: number, z: number) => void;
  onClosePanel: () => void;
  onGhost: GhostHandler;
}) {
  const spec = RIDE_TYPES[ride.type];
  const [, refresh] = useState(0);
  const problem = world.problem(ride);
  const fair = fairPrice(ride);
  const ratings = ratingsOf(ride);
  if (ride.coaster && !ride.coaster.complete) {
    return (
      <>
        <p className={styles.blurb}>{spec.blurb}</p>
        <TrackBuilder world={world} ride={ride} onGhost={onGhost} />
        <DemolishButton world={world} ride={ride} onClosePanel={onClosePanel} />
      </>
    );
  }
  const setPrice = (price: number) => {
    world.setPrice(ride, price);
    refresh((value) => value + 1);
  };
  return (
    <>
      <p className={styles.blurb}>{spec.blurb}</p>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={ride.open}
          onClick={() => {
            world.setOpen(ride, !ride.open);
            refresh((value) => value + 1);
          }}
        >
          {ride.open ? 'Open' : 'Closed'}
        </button>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            onFocus(ride.x + ride.width / 2, ride.z + ride.depth / 2);
          }}
        >
          Show on map
        </button>
      </div>
      {problem && ride.open && <p className={styles.warning}>{problem}</p>}

      <div className={styles.price}>
        <span id={`price-${ride.id}`}>{spec.kind === 'ride' ? 'Ticket price' : 'Price'}</span>
        <button
          type="button"
          aria-label="Lower price"
          onClick={() => {
            setPrice(ride.price - 10);
          }}
        >
          <Minus aria-hidden="true" />
        </button>
        <output aria-labelledby={`price-${ride.id}`}>{money(ride.price, true)}</output>
        <button
          type="button"
          aria-label="Raise price"
          onClick={() => {
            setPrice(ride.price + 10);
          }}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      {spec.price > 0 && (
        <p className={styles.small}>
          Guests think it’s worth about {money(fair, true)}.{' '}
          {ride.price > fair * 2
            ? 'Nobody will pay this much!'
            : ride.price > fair * 1.4
              ? 'Many guests will think it’s too expensive.'
              : ''}
        </p>
      )}

      <dl className={styles.stats}>
        <div>
          <dt>Customers this month</dt>
          <dd>{ride.monthCustomers}</dd>
        </div>
        <div>
          <dt>Income this month</dt>
          <dd>{money(ride.monthIncome)}</dd>
        </div>
        <div>
          <dt>All-time customers</dt>
          <dd>{ride.customers}</dd>
        </div>
        <div>
          <dt>Running cost</dt>
          <dd>{money(spec.upkeep)} / month</dd>
        </div>
        {spec.kind === 'ride' && (
          <>
            <div>
              <dt>In the queue</dt>
              <dd>{ride.queue.length}</dd>
            </div>
            <div>
              <dt>On the ride</dt>
              <dd>{ride.riders.length}</dd>
            </div>
          </>
        )}
      </dl>

      {spec.kind === 'ride' && <Maintenance world={world} ride={ride} />}
      {ride.coaster && <CoasterResults world={world} ride={ride} />}
      {spec.kind === 'ride' && (!ride.coaster || ride.coaster.stats) && (
        <dl className={styles.ratings}>
          <div>
            <dt>Excitement</dt>
            <dd>
              {ratings.excitement.toFixed(1)} <small>({level(ratings.excitement)})</small>
            </dd>
          </div>
          <div>
            <dt>Intensity</dt>
            <dd>
              {ratings.intensity.toFixed(1)} <small>({level(ratings.intensity)})</small>
            </dd>
          </div>
          <div>
            <dt>Nausea</dt>
            <dd>
              {ratings.nausea.toFixed(1)} <small>({level(ratings.nausea)})</small>
            </dd>
          </div>
        </dl>
      )}

      <DemolishButton world={world} ride={ride} onClosePanel={onClosePanel} />
    </>
  );
}

const INSPECTIONS = [
  { days: 2, label: 'Every 2 days' },
  { days: 5, label: 'Every 5 days' },
  { days: 10, label: 'Every 10 days' },
  { days: 0, label: 'Never' },
];

/** Reliability, breakdowns and how often a mechanic should check the ride. */
function Maintenance({ world, ride }: { world: World; ride: Ride }) {
  const [, refresh] = useState(0);
  const park = world.park;
  const since = Math.floor((park.time - ride.lastInspection) / DAY_SECONDS);
  return (
    <>
      <dl className={styles.stats}>
        <div>
          <dt>Reliability</dt>
          <dd>{Math.round(ride.reliability * 100)}%</dd>
        </div>
        <div>
          <dt>Breakdowns · down this month</dt>
          <dd>
            {ride.breakdowns} · {Math.round(ride.downtime / DAY_SECONDS)} days
          </dd>
        </div>
        <div>
          <dt>Last inspected</dt>
          <dd>{since <= 0 ? 'today' : `${since} ${since === 1 ? 'day' : 'days'} ago`}</dd>
        </div>
      </dl>
      <div className={styles.segmented} role="group" aria-label="Inspections">
        {INSPECTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            aria-pressed={ride.inspectEvery === option.days}
            onClick={() => {
              world.setInspection(ride, option.days);
              refresh((value) => value + 1);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}

function DemolishButton({
  world,
  ride,
  onClosePanel,
}: {
  world: World;
  ride: Ride;
  onClosePanel: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const park = world.park;
  const refund = park.removalRefund(ride.x, ride.z);
  return confirm ? (
    <div className={styles.row}>
      <button
        type="button"
        className={styles.danger}
        onClick={() => {
          park.demolish(ride.x, ride.z);
          onClosePanel();
        }}
      >
        Demolish for {money(refund)} back
      </button>
      <button
        type="button"
        className={styles.link}
        onClick={() => {
          setConfirm(false);
        }}
      >
        Keep it
      </button>
    </div>
  ) : (
    <button
      type="button"
      className={styles.link}
      onClick={() => {
        setConfirm(true);
      }}
    >
      Demolish…
    </button>
  );
}

function Mood({ happiness }: { happiness: number }) {
  const props = { 'aria-hidden': true, className: styles.mood } as const;
  if (happiness > 0.8) return <FaceGrinning {...props} />;
  if (happiness > 0.6) return <FaceSlightlySmiling {...props} />;
  if (happiness > 0.4) return <FaceNeutral {...props} />;
  if (happiness > 0.2) return <FaceSlightlyFrowning {...props} />;
  return <FaceAngry {...props} />;
}

function describe(world: World, guest: Guest): string {
  const at = world.park.ride(guest.at);
  switch (guest.state) {
    case 'queuing':
      return `Queuing for ${at?.name ?? 'a ride'}`;
    case 'riding':
      return `Riding ${at?.name ?? 'a ride'}`;
    case 'buying':
      return at?.type === 'toilets' ? 'Using the toilets' : `Buying from ${at?.name ?? 'a stall'}`;
    case 'sitting':
      return 'Resting on a bench';
    case 'gone':
      return 'Gone home';
    case 'walking': {
      if (guest.goal?.kind === 'leave') return 'Heading for the exit';
      if (guest.goal?.kind === 'ride')
        return `Walking to ${world.park.ride(guest.goal.ride)?.name ?? 'a ride'}`;
      return 'Wandering';
    }
  }
}

export function GuestInfo({
  world,
  guest,
  following,
  onFollow,
}: {
  world: World;
  guest: Guest;
  following: boolean;
  onFollow: (on: boolean) => void;
}) {
  return (
    <>
      <div className={styles.row}>
        <Mood happiness={guest.happiness} />
        <p className={styles.status}>{describe(world, guest)}</p>
      </div>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={following}
          onClick={() => {
            onFollow(!following);
          }}
        >
          {following ? 'Following' : 'Follow'}
        </button>
        <span className={styles.small}>
          {money(guest.money)} left, {money(guest.spent)} spent
          {guest.holding === 'balloon' ? ' · has a balloon' : ''}
          {guest.hasMap ? ' · has a map' : ''}
        </span>
      </div>
      <div className={styles.bars}>
        <Bar label="Happiness" value={guest.happiness} />
        <Bar label="Energy" value={guest.energy} />
        <Bar label="Hunger" value={guest.hunger} tone="bad" />
        <Bar label="Thirst" value={guest.thirst} tone="bad" />
        <Bar label="Toilet" value={guest.toilet} tone="bad" />
        <Bar label="Nausea" value={guest.nausea} tone="bad" />
      </div>
      <h3 className={styles.subhead}>Thoughts</h3>
      {guest.thoughts.length === 0 ? (
        <p className={styles.small}>Nothing much yet.</p>
      ) : (
        <ul className={styles.thoughts}>
          {guest.thoughts.map((thought, index) => (
            <li key={`${thought.day}-${index}`}>“{thought.text}”</li>
          ))}
        </ul>
      )}
    </>
  );
}
