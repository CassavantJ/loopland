import { useState } from 'react';

import { Game } from './components/Game';
import { ScenarioPicker } from './components/Scenarios';
import { loadPark, newPark, savePark } from './game/save';
import type { ScenarioDef } from './sim/scenarios';

/**
 * Loads the saved park, or shows the scenario picker over the first scenario. Picking a
 * scenario swaps in a fresh park.
 */
export function App() {
  const [saved] = useState(loadPark);
  const [park, setPark] = useState(() => saved ?? newPark());
  const [generation, setGeneration] = useState(0);
  const [picking, setPicking] = useState(saved === null);
  const start = (def: ScenarioDef) => {
    const fresh = newPark(def);
    savePark(fresh);
    setPark(fresh);
    setGeneration((value) => value + 1);
    setPicking(false);
  };
  return (
    <>
      <Game
        key={generation}
        park={park}
        paused={picking}
        onNewGame={() => {
          setPicking(true);
        }}
        onStart={start}
      />
      {picking && (
        <ScenarioPicker
          current={saved !== null || generation > 0 ? park.scenario : null}
          onStart={start}
          onClose={
            saved !== null || generation > 0
              ? () => {
                  setPicking(false);
                }
              : null
          }
        />
      )}
    </>
  );
}
