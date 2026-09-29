import { useState } from 'react';

import { Game } from './components/Game';
import { clearSave, loadPark, newPark, savePark } from './game/save';

/** Loads the saved park, or starts a fresh one. "New park" swaps in a new world. */
export function App() {
  const [park, setPark] = useState(() => loadPark() ?? newPark());
  const [generation, setGeneration] = useState(0);
  return (
    <Game
      key={generation}
      park={park}
      onNewPark={() => {
        clearSave();
        const fresh = newPark();
        savePark(fresh);
        setPark(fresh);
        setGeneration((value) => value + 1);
      }}
    />
  );
}
