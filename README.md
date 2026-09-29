# Loopland

Build a theme park: rides, coasters, scenery and happy (or queasy) guests.

An original theme-park builder in the spirit of the classic park sims, drawn as an isometric
diorama with three.js. Lay paths from the gate, add flat rides and stalls, design roller
coasters piece by piece, and keep guests fed, watered and entertained. Everything, from the
ride models to the guests, is made in code for this game.

- **Simulation** (`src/sim/`): the land, building rules, guests (needs, tastes, thoughts,
  queues), rides and money, all plain TypeScript with tests. A fixed-step clock runs it.
- **Coasters** (`src/sim/track.ts`, `coaster.ts`, `coasters.ts`): track pieces, a dense
  sample of the finished circuit, train physics, and a test run that measures speed, drops,
  G-forces, airtime and inversions to rate each coaster. Tests check that every ready-made
  layout closes, runs and rates sensibly.
- **View** (`src/view/`): the terrain, paths and every model, built from primitives and kept
  in sync with the simulation.

- **Staff and upkeep** (`src/sim/crew.ts`, `staff.ts`, `research.ts`): litter, sick, bins and
  benches; handymen, mechanics, security guards and entertainers; ride breakdowns and
  inspections; vandalism; and research that invents new rides over time.

- **Landscape** (`src/sim/park.ts`, `beauty.ts`): brush tools to raise, lower and level land
  and to paint it; lakes whose water finds its own level; themed scenery; and a beauty map
  that makes nearby rides more exciting and passing guests happier.

- **Scenarios** (`src/sim/scenarios.ts`, `business.ts`): six parks with goals and deadlines
  (guests and rating, park value, exciting coasters, monthly income) plus a sandbox; loans,
  marketing campaigns, land to buy, and monthly awards. A test plays the first scenario
  through to prove it can be won.

Part of [Jake's hub](https://raylmao.com). Scaffolded from the hub's app template, so it shares
the hub's theme, font and "back to the hub" bar (see `src/hub/`).

## Develop

```bash
pnpm install
pnpm dev
```

`pnpm check` runs the typecheck, lint, format check and tests (Vitest, any `*.test.ts` under
`src/`); CI runs it on every push.

## Deploy

Hosted as its own Cloudflare Pages project at `https://loopland.raylmao.com`. The full steps
(GitHub repo, Pages project, subdomain and hub registry entry) are in the hub's
`ADDING_AN_APP.md`.

`public/_headers` lets the hub embed this app (`frame-ancestors`). If the app calls an API or
loads anything from another origin, add that origin to the Content-Security-Policy there.
