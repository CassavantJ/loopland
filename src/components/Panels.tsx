import { ArrowDown, ArrowUp, Equal, Minus, Plus, RotateCw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { Brush, Selection, Tool } from '../game/tools';
import { SURFACES } from '../sim/park';
import {
  COASTERS,
  money,
  PATH_ITEMS,
  RIDE_TYPES,
  RIDES,
  SCENERY,
  STALLS,
  THEMES,
  type Theme,
  type RideType,
} from '../sim/catalog';
import { MONTHS, type Ledger } from '../sim/park';
import type { World } from '../sim/world';
import styles from './Game.module.css';
import type { GhostHandler } from './Builder';
import { ResearchPanel, StaffInfo, StaffPanel } from './Crew';
import { GuestInfo, RideInfo } from './Info';

export type PanelId =
  | 'rides'
  | 'shops'
  | 'scenery'
  | 'land'
  | 'water'
  | 'staff'
  | 'research'
  | 'park'
  | 'money'
  | 'menu';

const FACINGS = ['north', 'east', 'south', 'west'];
const BRUSHES: readonly Brush[] = [0, 1, 3, 5];

interface Props {
  world: World;
  panel: PanelId | null;
  selection: Selection;
  tool: Tool;
  facing: number;
  touch: boolean;
  following: boolean;
  onFollow: (on: boolean) => void;
  onTool: (tool: Tool) => void;
  onTurn: () => void;
  onClose: () => void;
  onFocus: (x: number, z: number) => void;
  onSelect: (selection: Selection) => void;
  onNewPark: () => void;
  onSave: () => boolean;
  onGhost: GhostHandler;
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.panelHeader}>
        <h2>{title}</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function Catalog({
  items,
  world,
  tool,
  onTool,
}: {
  items: readonly RideType[];
  world: World;
  tool: Tool;
  onTool: (tool: Tool) => void;
}) {
  return (
    <ul className={styles.catalog}>
      {items.map((item) => {
        const active = tool.kind === 'ride' && tool.type === item.id;
        const invented = world.park.research.invented.includes(item.id);
        const affordable = item.cost <= world.park.money && invented;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={active}
              disabled={!affordable}
              onClick={() => {
                onTool({ kind: 'ride', type: item.id });
              }}
            >
              <span className={styles.swatch} aria-hidden="true">
                {item.colours.slice(0, 3).map((colour) => (
                  <span key={colour} style={{ background: colour }} />
                ))}
              </span>
              <span className={styles.itemText}>
                <strong>{item.name}</strong>
                <small>{item.blurb}</small>
                {!invented && <small className={styles.locked}>Not invented yet</small>}
                <small>
                  {money(item.cost)}
                  {item.coaster
                    ? ' · design your own track'
                    : ` · ${item.width}×${item.depth}${item.kind === 'ride' ? ` · excitement ${item.excitement.toFixed(1)}` : ''}`}
                </small>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const LEDGER_NAMES: Record<keyof Ledger, string> = {
  entrance: 'Park entrance',
  rides: 'Ride tickets',
  food: 'Shops and stalls',
  construction: 'Construction',
  upkeep: 'Ride running costs',
  wages: 'Staff wages',
  research: 'Research',
  interest: 'Loan interest',
};

function LedgerTable({ ledger }: { ledger: Ledger }) {
  const total = Object.values(ledger).reduce((sum, value) => sum + value, 0);
  return (
    <dl className={styles.stats}>
      {(Object.keys(LEDGER_NAMES) as (keyof Ledger)[])
        .filter((key) => ledger[key] !== 0)
        .map((key) => (
          <div key={key}>
            <dt>{LEDGER_NAMES[key]}</dt>
            <dd data-negative={ledger[key] < 0 || undefined}>{money(ledger[key])}</dd>
          </div>
        ))}
      <div className={styles.total}>
        <dt>Total</dt>
        <dd data-negative={total < 0 || undefined}>{money(total)}</dd>
      </div>
    </dl>
  );
}

/** Whichever side panel is open: a catalogue, a ride or guest, the park, money or the menu. */
export function Panels(props: Props) {
  const { world, panel, selection, tool, onTool, onClose } = props;
  const park = world.park;
  const [confirmNew, setConfirmNew] = useState(false);
  const [saved, setSaved] = useState('');
  const [theme, setTheme] = useState<Theme>('nature');

  if (selection?.kind === 'ride') {
    const ride = park.ride(selection.id);
    if (ride) {
      return (
        <Panel
          key={`${ride.id}:${ride.coaster ? String(ride.coaster.complete) : ''}`}
          title={ride.name}
          onClose={onClose}
        >
          <RideInfo
            world={world}
            ride={ride}
            onFocus={props.onFocus}
            onClosePanel={onClose}
            onGhost={props.onGhost}
          />
        </Panel>
      );
    }
  }
  if (selection?.kind === 'staff') {
    const staff = park.staff.find((member) => member.id === selection.id);
    return (
      <Panel title={staff?.name ?? 'Staff'} onClose={onClose}>
        {staff ? (
          <StaffInfo
            world={world}
            staff={staff}
            following={props.following}
            onFollow={props.onFollow}
            onClosePanel={onClose}
          />
        ) : (
          <p className={styles.small}>No longer works here.</p>
        )}
      </Panel>
    );
  }
  if (selection?.kind === 'guest') {
    const guest = world.guest(selection.id);
    return (
      <Panel title={guest?.name ?? 'Guest'} onClose={onClose}>
        {guest ? (
          <GuestInfo
            world={world}
            guest={guest}
            following={props.following}
            onFollow={props.onFollow}
          />
        ) : (
          <p className={styles.small}>This guest has gone home.</p>
        )}
      </Panel>
    );
  }

  const placing = tool.kind !== 'inspect' && !panel;
  if (placing) {
    const name =
      tool.kind === 'ride'
        ? RIDE_TYPES[tool.type].name
        : tool.kind === 'scenery'
          ? SCENERY[tool.id].name
          : tool.kind === 'item'
            ? PATH_ITEMS[tool.id].name
            : tool.kind === 'path'
              ? tool.queue
                ? 'Queue line'
                : 'Footpath'
              : tool.kind === 'land'
                ? { raise: 'Raise land', lower: 'Lower land', level: 'Level land' }[tool.mode]
                : tool.kind === 'paint'
                  ? `Paint ${SURFACES[tool.surface]?.name.toLowerCase() ?? 'ground'}`
                  : tool.kind === 'water'
                    ? tool.raise
                      ? 'Raise water'
                      : 'Lower water'
                    : 'Bulldozer';
    const hint =
      tool.kind === 'path'
        ? `${props.touch ? 'Drag' : 'Click and drag'} to lay a straight line.`
        : tool.kind === 'ride'
          ? `${props.touch ? 'Tap' : 'Click'} to build. Entrance faces ${FACINGS[props.facing] ?? 'south'}.`
          : tool.kind === 'land' || tool.kind === 'water'
            ? `${props.touch ? 'Tap' : 'Click'} ${tool.kind === 'land' && tool.size === 0 ? 'a corner of a tile' : 'the land'}.${tool.kind === 'land' && tool.mode === 'level' ? ' Levels to where you start.' : ''}`
            : `${props.touch ? 'Tap or drag' : 'Click or drag'} to ${tool.kind === 'bulldoze' ? 'clear tiles' : 'place'}.`;
    return (
      <div className={styles.placing} role="status">
        <strong>{name}</strong>
        <span>{hint}</span>
        {(tool.kind === 'land' || tool.kind === 'water' || tool.kind === 'paint') && (
          <span className={styles.brushes} role="group" aria-label="Brush size">
            {BRUSHES.filter((size) => size > 0 || tool.kind === 'land').map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={tool.size === size}
                onClick={() => {
                  onTool({ ...tool, size });
                }}
              >
                {size === 0 ? 'Corner' : `${size}×${size}`}
              </button>
            ))}
          </span>
        )}
        {tool.kind === 'ride' && (
          <button type="button" onClick={props.onTurn} aria-label="Turn it (R)">
            <RotateCw aria-hidden="true" /> Turn
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onTool({ kind: 'inspect' });
          }}
        >
          Done
        </button>
      </div>
    );
  }

  switch (panel) {
    case 'rides':
      return (
        <Panel title="Rides" onClose={onClose}>
          <h3 className={styles.subhead}>Roller coasters</h3>
          <Catalog items={COASTERS} world={world} tool={tool} onTool={onTool} />
          <h3 className={styles.subhead}>Flat rides</h3>
          <Catalog items={RIDES} world={world} tool={tool} onTool={onTool} />
        </Panel>
      );
    case 'shops':
      return (
        <Panel title="Shops and stalls" onClose={onClose}>
          <Catalog items={STALLS} world={world} tool={tool} onTool={onTool} />
        </Panel>
      );
    case 'scenery':
      return (
        <Panel title="Scenery" onClose={onClose}>
          <div className={styles.tabs} role="group" aria-label="Themes">
            {THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={theme === option.id}
                onClick={() => {
                  setTheme(option.id);
                }}
              >
                {option.name}
              </button>
            ))}
          </div>
          <ul className={styles.grid}>
            {Object.values(SCENERY)
              .filter((item) => item.theme === theme)
              .map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'scenery' && tool.id === item.id}
                    onClick={() => {
                      onTool({ kind: 'scenery', id: item.id });
                    }}
                  >
                    <strong>{item.name}</strong>
                    <small>{money(item.cost)}</small>
                  </button>
                </li>
              ))}
          </ul>
          <h3 className={styles.subhead}>For paths</h3>
          <ul className={styles.grid}>
            {Object.values(PATH_ITEMS).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={tool.kind === 'item' && tool.id === item.id}
                  onClick={() => {
                    onTool({ kind: 'item', id: item.id });
                  }}
                >
                  <strong>{item.name}</strong>
                  <small>{money(item.cost)}</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      );
    case 'land': {
      const size: Brush = 'size' in tool && tool.kind !== 'water' ? tool.size : 3;
      return (
        <Panel title="Land" onClose={onClose}>
          <p className={styles.small}>
            Shape the land a corner or a patch at a time; the land around follows. Earth costs{' '}
            {money(250)} a step.
          </p>
          <div className={styles.row}>
            {(
              [
                ['raise', 'Raise', <ArrowUp key="icon" aria-hidden="true" />],
                ['lower', 'Lower', <ArrowDown key="icon" aria-hidden="true" />],
                ['level', 'Level', <Equal key="icon" aria-hidden="true" />],
              ] as const
            ).map(([mode, label, icon]) => (
              <button
                key={mode}
                type="button"
                className={styles.toggle}
                onClick={() => {
                  onTool({ kind: 'land', mode, size: mode === 'level' && size === 0 ? 3 : size });
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <h3 className={styles.subhead}>Paint the ground</h3>
          <ul className={styles.surfaces}>
            {SURFACES.map((surface, index) => (
              <li key={surface.name}>
                <button
                  type="button"
                  onClick={() => {
                    onTool({ kind: 'paint', surface: index, size: size === 0 ? 3 : size });
                  }}
                >
                  <span style={{ background: surface.colour }} aria-hidden="true" />
                  {surface.name}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      );
    }
    case 'water':
      return (
        <Panel title="Water" onClose={onClose}>
          <p className={styles.small}>
            Make lakes and ponds: raise the water a step at a time over a patch of land, or lower
            the land first for a deeper lake. Paddle boats need water they can float on. Costs{' '}
            {money(500)} a tile.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => {
                onTool({ kind: 'water', raise: true, size: 3 });
              }}
            >
              <ArrowUp aria-hidden="true" /> Raise water
            </button>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => {
                onTool({ kind: 'water', raise: false, size: 3 });
              }}
            >
              <ArrowDown aria-hidden="true" /> Lower water
            </button>
          </div>
        </Panel>
      );
    case 'staff':
      return (
        <Panel title="Staff" onClose={onClose}>
          <StaffPanel
            world={world}
            onSelect={(id) => {
              props.onSelect({ kind: 'staff', id });
            }}
          />
        </Panel>
      );
    case 'research':
      return (
        <Panel title="Research" onClose={onClose}>
          <ResearchPanel world={world} />
        </Panel>
      );
    case 'park': {
      const thoughts = new Map<string, number>();
      for (const guest of world.guests) {
        const thought = guest.thoughts[0];
        if (thought) thoughts.set(thought.text, (thoughts.get(thought.text) ?? 0) + 1);
      }
      const top = [...thoughts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      return (
        <Panel title={park.name} onClose={onClose}>
          <div className={styles.price}>
            <span id="entrance-fee">Entrance fee</span>
            <button
              type="button"
              aria-label="Lower entrance fee"
              onClick={() => {
                park.setEntranceFee(park.entranceFee - 100);
                setSaved('');
              }}
            >
              <Minus aria-hidden="true" />
            </button>
            <output aria-labelledby="entrance-fee">{money(park.entranceFee, true)}</output>
            <button
              type="button"
              aria-label="Raise entrance fee"
              onClick={() => {
                park.setEntranceFee(park.entranceFee + 100);
                setSaved('');
              }}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <dl className={styles.stats}>
            <div>
              <dt>Guests in the park</dt>
              <dd>{world.inPark}</dd>
            </div>
            <div>
              <dt>Visitors so far</dt>
              <dd>{world.visitors}</dd>
            </div>
            <div>
              <dt>Park rating</dt>
              <dd>{park.rating} / 999</dd>
            </div>
            <div>
              <dt>Rides and stalls</dt>
              <dd>{park.rides.length}</dd>
            </div>
            <div>
              <dt>Clean paths</dt>
              <dd>{Math.round(world.cleanliness * 100)}%</dd>
            </div>
            <div>
              <dt>Staff</dt>
              <dd>{park.staff.length}</dd>
            </div>
          </dl>
          <h3 className={styles.subhead}>What guests are thinking</h3>
          {top.length === 0 ? (
            <p className={styles.small}>No guests yet. Connect a ride to the entrance path.</p>
          ) : (
            <ul className={styles.thoughts}>
              {top.map(([text, count]) => (
                <li key={text}>
                  “{text}” <small>× {count}</small>
                </li>
              ))}
            </ul>
          )}
          <h3 className={styles.subhead}>News</h3>
          <ul className={styles.news}>
            {park.messages
              .slice(-8)
              .reverse()
              .map((message, index) => (
                <li key={`${message.day}-${index}`}>
                  {message.ride !== undefined || message.guest !== undefined ? (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => {
                        props.onSelect(
                          message.ride !== undefined
                            ? { kind: 'ride', id: message.ride }
                            : { kind: 'guest', id: message.guest ?? 0 },
                        );
                      }}
                    >
                      {message.text}
                    </button>
                  ) : (
                    message.text
                  )}
                </li>
              ))}
          </ul>
        </Panel>
      );
    }
    case 'money': {
      const last = park.history.at(-1);
      return (
        <Panel title="Money" onClose={onClose}>
          <p className={styles.bigNumber} data-negative={park.money < 0 || undefined}>
            {money(park.money)}
          </p>
          <h3 className={styles.subhead}>This month</h3>
          <LedgerTable ledger={park.ledger} />
          {last && (
            <>
              <h3 className={styles.subhead}>Last month ({MONTHS[last.month % MONTHS.length]})</h3>
              <LedgerTable ledger={last.ledger} />
            </>
          )}
        </Panel>
      );
    }
    case 'menu':
      return (
        <Panel title="Loopland" onClose={onClose}>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => {
                setSaved(props.onSave() ? 'Saved.' : 'Couldn’t save in this browser.');
              }}
            >
              Save now
            </button>
            <span className={styles.small} role="status">
              {saved || 'The park also saves itself every month.'}
            </span>
          </div>
          {confirmNew ? (
            <div className={styles.row}>
              <button type="button" className={styles.danger} onClick={props.onNewPark}>
                Start a new park
              </button>
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setConfirmNew(false);
                }}
              >
                Keep this one
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setConfirmNew(true);
              }}
            >
              New park…
            </button>
          )}
          <h3 className={styles.subhead}>How to play</h3>
          <ul className={styles.help}>
            <li>
              Lay paths from the entrance, then build rides with their entrance and exit touching a
              path.
            </li>
            <li>Queue lines leading to a ride’s entrance let more guests wait.</li>
            <li>Hungry, thirsty guests need food, drinks and toilets nearby.</li>
            <li>Click a ride or a guest to see how they’re doing.</li>
          </ul>
          <h3 className={styles.subhead}>Controls</h3>
          <ul className={styles.help}>
            <li>Drag (or right-drag while building) to move; scroll or pinch to zoom.</li>
            <li>Q and E rotate the view; R turns what you’re placing.</li>
            <li>Space pauses; 1, 2 and 3 set the speed; Esc stops building.</li>
          </ul>
        </Panel>
      );
    case null:
      return null;
  }
}
