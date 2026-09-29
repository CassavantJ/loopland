import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react';

import { markCompleted, savePark } from '../game/save';
import { describeObjective, scenario, type ScenarioDef } from '../sim/scenarios';
import {
  markTutorialDone,
  nextStep,
  startTutorial,
  STEPS,
  type TutorialState,
} from '../game/tutorial';
import { OutcomeDialog } from './Scenarios';
import { Tutorial } from './Tutorial';
import { buildDesign, placeCoaster } from '../sim/coasters';
import { Interaction, type Selection, type Tool } from '../game/tools';
import type { Park } from '../sim/park';
import { TICK, World } from '../sim/world';
import { ParkView } from '../view/ParkView';
import styles from './Game.module.css';
import { Hud } from './Hud';
import { Panels, type PanelId } from './Panels';
import { Toolbar } from './Toolbar';

/** A 4 Hz heartbeat for the parts of the UI that show live numbers. */
function useHeartbeat(): number {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBeat((value) => value + 1);
    }, 250);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return beat;
}

const coarse = () => window.matchMedia('(pointer: coarse)').matches;
const subscribeNone = () => () => undefined;

export interface Note {
  text: string;
  bad: boolean;
  id: number;
}

export function Game({
  park,
  paused,
  onNewGame,
  onStart,
  tutorial: withTutorial = false,
}: {
  park: Park;
  /** Held still while a menu over the whole game is open. */
  paused: boolean;
  onNewGame: () => void;
  onStart: (def: ScenarioDef, tutorial?: boolean) => void;
  /** Start with the tutorial running. */
  tutorial?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [world] = useState(() => new World(park));
  const view = useRef<ParkView | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const [tool, setToolState] = useState<Tool>({ kind: 'inspect' });
  const [facing, setFacing] = useState(2);
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [speed, setSpeed] = useState(1);
  const [note, setNote] = useState<Note | null>(null);
  const [following, setFollowing] = useState(false);
  const speedRef = useRef(1);
  const followRef = useRef<number | null>(null);
  // Re-render a few times a second so money, guests and panels stay current.
  useHeartbeat();
  const [tutorial, setTutorial] = useState<TutorialState | null>(() =>
    withTutorial ? startTutorial(world) : null,
  );
  const touch = useSyncExternalStore(subscribeNone, coarse);

  const select = useEffectEvent((next: Selection) => {
    setSelection(next);
    setFollowing(false);
    if (next) setPanel(null);
  });
  const showNote = useEffectEvent((text: string, bad = false) => {
    setNote((current) =>
      current?.text === text ? current : { text, bad, id: (current?.id ?? 0) + 1 },
    );
  });

  // The clock stops while a menu covers the game, or the scenario's result is showing.
  const outcome = world.park.outcome;
  const showOutcome = outcome !== 'playing' && !world.park.outcomeSeen && !paused;
  useEffect(() => {
    speedRef.current = paused || showOutcome ? 0 : speed;
  }, [speed, paused, showOutcome]);
  useEffect(() => {
    followRef.current =
      following && (selection?.kind === 'guest' || selection?.kind === 'staff')
        ? selection.kind === 'staff'
          ? -selection.id
          : selection.id
        : null;
  }, [following, selection]);

  // The engine: view, input and the simulation loop.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const created = new ParkView(element, world, { shadows: !coarse() });
    view.current = created;
    const input = new Interaction(element, created, world, {
      select: (next) => {
        select(next);
      },
      note: (text, bad) => {
        showNote(text, bad);
      },
      changed: () => undefined,
      faced: (next) => {
        setFacing(next);
      },
      done: () => {
        setToolState({ kind: 'inspect' });
      },
    });
    interaction.current = input;
    // Development only: lets automated checks build parks and move the camera.
    if (import.meta.env.DEV) {
      (window as Window & { loopland?: unknown }).loopland = {
        world,
        view: created,
        input,
        coasters: { placeCoaster, buildDesign },
      };
    }

    const resize = () => {
      const rect = element.getBoundingClientRect();
      created.resize(rect.width, rect.height, Math.min(window.devicePixelRatio || 1, 2));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();

    let frame = 0;
    let last = performance.now();
    let accumulated = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      accumulated += dt * speedRef.current;
      let steps = 0;
      while (accumulated >= TICK && steps < 60) {
        world.tick();
        accumulated -= TICK;
        steps++;
      }
      if (steps === 60) accumulated = 0;
      const id = followRef.current;
      // Staff are followed by negative id, guests by positive.
      const followed =
        id === null
          ? undefined
          : id < 0
            ? world.park.staff.find((member) => member.id === -id)
            : world.guest(id);
      if (followed) {
        created.target.x += (followed.x - created.target.x) * Math.min(1, dt * 4);
        created.target.z += (followed.z - created.target.z) * Math.min(1, dt * 4);
      }
      created.render(now / 1000, dt);
    };
    frame = requestAnimationFrame(loop);

    const save = () => {
      if (document.hidden) savePark(world.park);
    };
    document.addEventListener('visibilitychange', save);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', save);
      input.destroy();
      created.dispose();
      view.current = null;
      interaction.current = null;
    };
  }, [world]);

  // A finished scenario: record it and save.
  useEffect(() => {
    if (outcome === 'playing') return;
    if (outcome === 'won') markCompleted(world.park.scenario);
    savePark(world.park);
  }, [outcome, world]);

  // Autosave at the start of every month.
  const month = world.park.month;
  useEffect(() => {
    if (month > 0) savePark(world.park);
  }, [month, world]);

  // Notes fade after a few seconds.
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => {
      setNote(null);
    }, 3200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [note]);

  const setTool = (next: Tool) => {
    setToolState(next);
    interaction.current?.setTool(next);
    if (next.kind !== 'inspect') setSelection(null);
  };

  const turn = () => {
    interaction.current?.turn();
    setFacing((value) => (value + 1) % 4);
  };

  // Keyboard: pan, zoom, rotate, speed and tool shortcuts.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, dialog')) return;
    const current = view.current;
    if (!current || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = 40;
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
        current.pan(step, 0);
        break;
      case 'ArrowRight':
      case 'd':
        current.pan(-step, 0);
        break;
      case 'ArrowUp':
      case 'w':
        current.pan(0, step);
        break;
      case 'ArrowDown':
      case 's':
        current.pan(0, -step);
        break;
      case '+':
      case '=':
        current.zoomBy(1.2);
        break;
      case '-':
        current.zoomBy(1 / 1.2);
        break;
      case 'q':
        current.rotate(-1);
        break;
      case 'e':
        current.rotate(1);
        break;
      case 'r':
        turn();
        break;
      case ' ':
        setSpeed((value) => (value === 0 ? 1 : 0));
        break;
      case '1':
      case '2':
      case '3':
        setSpeed(Number(event.key) === 3 ? 4 : Number(event.key));
        break;
      case 'Escape':
        setTool({ kind: 'inspect' });
        setPanel(null);
        setSelection(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      onKey(event);
    };
    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, []);

  return (
    <main className={styles.game} data-tool={tool.kind}>
      <h1 className="sr-only">{world.park.name}</h1>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <p className="sr-only">
        An isometric view of your theme park. Use the toolbar to build paths, rides, shops and
        scenery; drag to move around, scroll or pinch to zoom.
      </p>
      <Hud
        world={world}
        speed={speed}
        onSpeed={setSpeed}
        onMenu={() => {
          setSelection(null);
          setPanel(panel === 'menu' ? null : 'menu');
        }}
        onMessage={(message) => {
          if (message.ride !== undefined) setSelection({ kind: 'ride', id: message.ride });
          else if (message.guest !== undefined) setSelection({ kind: 'guest', id: message.guest });
        }}
        onGoal={() => {
          setSelection(null);
          setPanel('park');
        }}
        quiet={tutorial !== null}
      />
      <div className={styles.viewControls}>
        <button
          type="button"
          aria-label="Rotate view left"
          title="Rotate view (Q)"
          onClick={() => view.current?.rotate(-1)}
        >
          ⟲
        </button>
        <button
          type="button"
          aria-label="Rotate view right"
          title="Rotate view (E)"
          onClick={() => view.current?.rotate(1)}
        >
          ⟳
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => view.current?.zoomBy(1.25)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => view.current?.zoomBy(0.8)}
        >
          −
        </button>
      </div>
      {note && (
        <p key={note.id} className={styles.note} data-bad={note.bad || undefined} role="status">
          {note.text}
        </p>
      )}
      <Panels
        world={world}
        panel={panel}
        selection={selection}
        tool={tool}
        facing={facing}
        touch={touch}
        following={following}
        onFollow={setFollowing}
        onTool={(next) => {
          setTool(next);
          setPanel(null);
        }}
        onTurn={turn}
        onClose={() => {
          setPanel(null);
          setSelection(null);
          setFollowing(false);
        }}
        onFocus={(x, z) => view.current?.focus(x, z)}
        onSelect={setSelection}
        onNewGame={onNewGame}
        onTutorial={() => {
          setPanel(null);
          setTutorial(startTutorial(world));
        }}
        onSave={() => savePark(world.park)}
        onGhost={(ghost) => {
          const ride = selection?.kind === 'ride' ? world.park.ride(selection.id) : undefined;
          view.current?.setTrackGhost(ghost && ride ? { ...ghost, type: ride.type } : null);
        }}
      />
      {tutorial && (
        <Tutorial
          world={world}
          state={tutorial}
          selection={selection}
          touch={touch}
          onNext={() => {
            setTutorial((current) => (current ? nextStep(world, current) : current));
          }}
          onClose={() => {
            markTutorialDone();
            setTutorial(null);
          }}
        />
      )}
      <Toolbar
        highlight={tutorial ? STEPS[tutorial.step]?.highlight : undefined}
        tool={tool}
        panel={panel}
        onTool={(next) => {
          setTool(next);
          setPanel(null);
        }}
        onPanel={(next) => {
          setSelection(null);
          setPanel(panel === next ? null : next);
        }}
      />
      {showOutcome && (
        <OutcomeDialog
          won={outcome === 'won'}
          name={world.park.name}
          goal={describeObjective(world.park.objective)}
          onContinue={() => {
            world.park.acknowledgeOutcome();
            setSpeed(1);
          }}
          onRetry={() => {
            const def = scenario(world.park.scenario);
            if (def) onStart(def);
          }}
          onPick={() => {
            world.park.acknowledgeOutcome();
            onNewGame();
          }}
        />
      )}
    </main>
  );
}
