import { useState } from 'react';

import {
  AWARDS,
  borrow,
  CAMPAIGNS,
  INTEREST,
  LOAN_STEP,
  parkValue,
  repay,
  startCampaign,
  type CampaignId,
} from '../sim/business';
import { money, RIDE_TYPES } from '../sim/catalog';
import { describeObjective, objectiveStatus } from '../sim/scenarios';
import type { World } from '../sim/world';
import styles from './Game.module.css';

/** The park's loan, its worth, and marketing campaigns. */
export function Finance({ world }: { world: World }) {
  const park = world.park;
  const [note, setNote] = useState('');
  const [months, setMonths] = useState<Record<CampaignId, number>>({
    adverts: 2,
    vouchers: 1,
    'ride-advert': 2,
  });
  const rides = park.rides.filter((ride) => RIDE_TYPES[ride.type].kind === 'ride');
  const [advert, setAdvert] = useState<number | null>(rides[0]?.id ?? null);
  const act = (result: { ok: boolean; reason: string }, done: string) => {
    setNote(result.ok ? done : result.reason);
  };
  return (
    <>
      <dl className={styles.stats}>
        <div>
          <dt>Park value</dt>
          <dd>{money(parkValue(world))}</dd>
        </div>
        <div>
          <dt>Loan</dt>
          <dd>
            {money(park.loan)} <small>of {money(park.maxLoan)}</small>
          </dd>
        </div>
        <div>
          <dt>Interest</dt>
          <dd>{money(Math.round(park.loan * INTEREST))} a month</dd>
        </div>
      </dl>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.toggle}
          onClick={() => {
            act(borrow(park), `Borrowed ${money(LOAN_STEP)}.`);
          }}
        >
          Borrow {money(LOAN_STEP)}
        </button>
        <button
          type="button"
          className={styles.toggle}
          disabled={park.loan <= 0}
          onClick={() => {
            act(repay(park), `Repaid ${money(LOAN_STEP)}.`);
          }}
        >
          Repay {money(LOAN_STEP)}
        </button>
      </div>
      <h3 className={styles.subhead}>Marketing</h3>
      <ul className={styles.campaigns}>
        {(Object.keys(CAMPAIGNS) as CampaignId[]).map((id) => {
          const spec = CAMPAIGNS[id];
          const running = park.marketing.find((campaign) => campaign.id === id);
          return (
            <li key={id}>
              <strong>{spec.name}</strong>
              <small>
                {spec.blurb} {money(spec.cost)} a month.
              </small>
              {running ? (
                <p className={styles.status}>
                  Running: {running.monthsLeft} {running.monthsLeft === 1 ? 'month' : 'months'} left
                  {running.ride !== undefined
                    ? ` for ${park.ride(running.ride)?.name ?? 'a ride'}`
                    : ''}
                </p>
              ) : (
                <div className={styles.row}>
                  {id === 'ride-advert' && (
                    <select
                      aria-label="Ride to advertise"
                      value={advert ?? ''}
                      onChange={(event) => {
                        setAdvert(Number(event.target.value));
                      }}
                    >
                      {rides.map((ride) => (
                        <option key={ride.id} value={ride.id}>
                          {ride.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    aria-label={`How long to run ${spec.name.toLowerCase()}`}
                    value={months[id]}
                    onChange={(event) => {
                      setMonths({ ...months, [id]: Number(event.target.value) });
                    }}
                  >
                    {[1, 2, 3, 4].map((count) => (
                      <option key={count} value={count}>
                        {count} {count === 1 ? 'month' : 'months'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => {
                      act(
                        startCampaign(
                          park,
                          id,
                          months[id],
                          id === 'ride-advert' ? (advert ?? undefined) : undefined,
                        ),
                        `${spec.name} started.`,
                      );
                    }}
                  >
                    Start
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className={styles.small} role="status">
        {note}
      </p>
    </>
  );
}

/** The scenario's goal and how close the park is, and any awards it holds. */
export function Goal({ world }: { world: World }) {
  const park = world.park;
  const status = park.objective.kind === 'none' ? null : objectiveStatus(world);
  return (
    <>
      <div className={styles.goalBox} data-outcome={park.outcome}>
        <p>
          <strong>
            {park.outcome === 'won'
              ? 'Goal met! '
              : park.outcome === 'lost'
                ? 'Time’s up. '
                : 'Goal: '}
          </strong>
          {describeObjective(park.objective)}
        </p>
        {status && (
          <>
            <meter min={0} max={1} value={status.fraction} aria-label="Progress towards the goal" />
            <small>{status.progress}</small>
          </>
        )}
      </div>
      {park.awards.length > 0 && (
        <>
          <h3 className={styles.subhead}>Awards</h3>
          <ul className={styles.thoughts}>
            {park.awards.map((award) => (
              <li key={award.id}>
                <strong>{AWARDS[award.id].name}</strong> <small>{AWARDS[award.id].blurb}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
