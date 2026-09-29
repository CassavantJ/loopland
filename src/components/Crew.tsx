import { useState } from 'react';

import { money } from '../sim/catalog';
import {
  currentProject,
  daysLeft,
  FUNDING,
  projectKind,
  projectName,
  RESEARCH_ORDER,
} from '../sim/research';

const KIND_NAMES: Record<string, string> = {
  ride: 'ride',
  stall: 'shop',
  scenery: 'scenery',
  tool: 'tool',
};
import { costumeName, describeJob, STAFF, STAFF_ROLES, type Staff } from '../sim/staff';
import type { World } from '../sim/world';
import styles from './Game.module.css';

const rideName = (world: World) => (id: number) => world.park.ride(id)?.name ?? 'a ride';

/** Hiring, and everyone on the payroll. */
export function StaffPanel({ world, onSelect }: { world: World; onSelect: (id: number) => void }) {
  const park = world.park;
  const [note, setNote] = useState('');
  return (
    <>
      <ul className={styles.hires}>
        {STAFF_ROLES.map((role) => {
          const spec = STAFF[role];
          const count = park.staff.filter((member) => member.role === role).length;
          return (
            <li key={role}>
              <span
                className={styles.uniform}
                style={{ background: spec.uniform }}
                aria-hidden="true"
              />
              <span className={styles.itemText}>
                <strong>
                  {spec.plural} <small>({count})</small>
                </strong>
                <small>{spec.blurb}</small>
                <small>{money(spec.wage)} a month</small>
              </span>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => {
                  const hired = world.hire(role);
                  setNote(
                    hired
                      ? `${hired.name} starts at the park entrance.`
                      : 'Build a path from the park entrance first.',
                  );
                }}
              >
                Hire
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.small} role="status">
        {note}
      </p>
      {park.staff.length > 0 && (
        <>
          <h3 className={styles.subhead}>On the payroll</h3>
          <ul className={styles.roster}>
            {park.staff.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    onSelect(member.id);
                  }}
                >
                  {member.name}
                </button>
                <small>
                  {STAFF[member.role].name} · {describeJob(member, rideName(world))}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** One staff member: what they're doing, what they've done, and the sack. */
export function StaffInfo({
  world,
  staff,
  following,
  onFollow,
  onClosePanel,
}: {
  world: World;
  staff: Staff;
  following: boolean;
  onFollow: (on: boolean) => void;
  onClosePanel: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const spec = STAFF[staff.role];
  const done = staff.done;
  const tally =
    staff.role === 'handyman'
      ? `Swept ${done.sweep} paths, emptied ${done.empty} bins, repaired ${done.repair} things.`
      : staff.role === 'mechanic'
        ? `Fixed ${done.fix} breakdowns, did ${done.inspect} inspections.`
        : staff.role === 'entertainer'
          ? `Wearing the ${costumeName(staff).toLowerCase()} costume.`
          : 'Keeping an eye out for trouble.';
  return (
    <>
      <p className={styles.status}>{describeJob(staff, rideName(world))}</p>
      <p className={styles.small}>
        {spec.name}, paid {money(spec.wage)} a month. {tally}
      </p>
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
        {confirm ? (
          <>
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                world.fire(staff.id);
                onClosePanel();
              }}
            >
              Let {staff.name.split(' ')[0]} go
            </button>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setConfirm(false);
              }}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setConfirm(true);
            }}
          >
            Fire…
          </button>
        )}
      </div>
    </>
  );
}

/** Research funding, the current project, and what's already been invented. */
export function ResearchPanel({ world }: { world: World }) {
  const research = world.park.research;
  const [, refresh] = useState(0);
  const project = currentProject(research);
  const left = daysLeft(research);
  return (
    <>
      <div className={styles.segmented} role="group" aria-label="Research funding">
        {FUNDING.map((level, index) => (
          <button
            key={level.label}
            type="button"
            aria-pressed={research.funding === index}
            onClick={() => {
              world.setResearchFunding(index as 0 | 1 | 2 | 3);
              refresh((value) => value + 1);
            }}
          >
            {level.label}
            <small>{level.cost === 0 ? 'free' : `${money(level.cost)}/mo`}</small>
          </button>
        ))}
      </div>
      {project ? (
        <div className={styles.project}>
          <p className={styles.status}>Working on: {projectName(project)}</p>
          <meter min={0} max={1} value={research.progress} aria-label="Research progress" />
          <p className={styles.small}>
            {left === null
              ? 'Research is paused. Give it some money to carry on.'
              : `About ${left} ${left === 1 ? 'day' : 'days'} to go.`}
          </p>
        </div>
      ) : (
        <p className={styles.status}>Everything has been invented. Research costs nothing now.</p>
      )}
      <h3 className={styles.subhead}>Still to come</h3>
      <ul className={styles.thoughts}>
        {RESEARCH_ORDER.filter((id) => !research.invented.includes(id)).map((id) => (
          <li key={id}>
            {projectName(id)} <small>{KIND_NAMES[projectKind(id)] ?? ''}</small>
          </li>
        ))}
      </ul>
    </>
  );
}
