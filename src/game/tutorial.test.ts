import { describe, expect, it } from 'vitest';

import { createScenario, SCENARIOS } from '../sim/scenarios';
import { TICK, World } from '../sim/world';
import { nextStep, startTutorial, STEPS, type TutorialState } from './tutorial';
import type { Selection } from './tools';

describe('tutorial', () => {
  it('can be followed step by step in the first scenario', () => {
    const def = SCENARIOS[0];
    if (!def) throw new Error('no scenario');
    const park = createScenario(def);
    const world = new World(park);
    const gx = park.gate.x;
    const plaza = park.depth - 8;
    let state: TutorialState = startTutorial(world);
    let selection: Selection = null;
    const done = () => {
      const step = STEPS[state.step];
      return step?.done ? step.done({ world, selection, baseline: state.baseline }) : true;
    };
    const advance = () => {
      state = nextStep(world, state);
    };
    const expectStep = (id: string) => {
      expect(STEPS[state.step]?.id).toBe(id);
    };

    expectStep('welcome');
    advance();
    expectStep('camera');
    advance();

    expectStep('path');
    expect(done()).toBe(false);
    for (let z = plaza - 1; z >= plaza - 6; z--) park.buildPath(gx, z);
    expect(done()).toBe(true);
    advance();

    expectStep('ride');
    expect(done()).toBe(false);
    // A carousel just west of the path, entrance and exit facing it.
    const ride = park.placeRide('carousel', gx - 4, plaza - 6, 1);
    expect(ride).not.toBeNull();
    expect(done()).toBe(true);
    advance();

    expectStep('connect');
    expect(done()).toBe(true);
    advance();

    expectStep('shops');
    expect(done()).toBe(false);
    park.placeRide('burger-stall', gx + 1, plaza - 2, 3);
    expect(done()).toBe(false);
    park.placeRide('toilets', gx + 1, plaza - 3, 3);
    expect(done()).toBe(true);
    advance();

    expectStep('guests');
    for (let step = 0; step < 120 / TICK && world.guests.length === 0; step++) world.tick();
    const guest = world.guests[0];
    expect(guest).toBeDefined();
    expect(done()).toBe(false);
    selection = { kind: 'guest', id: guest?.id ?? 0 };
    expect(done()).toBe(true);
    advance();

    expectStep('queue');
    advance();

    expectStep('staff');
    expect(done()).toBe(false);
    world.hire('handyman');
    expect(done()).toBe(true);
    advance();

    expectStep('goal');
    expect(state.step).toBe(STEPS.length - 1);
  });
});
