# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

News Fights is a turn-based satirical strategy game: the player is a media outlet that manipulates true / half-true / false news to destroy a simulated city. Current stage: CONCEPT.md §7.4 step 3 — full simulation, headless bots, isometric PixiJS city with generated placeholder pixel art, UI per §7.3.

## Commands

Node.js is installed but may be missing from PATH in an already-open shell (refresh PATH or restart the app).

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm test             # Vitest, all tests
npx vitest run -t "true news"   # single test by name
npm run typecheck    # tsc for the app + tsconfig.sim.json (sim must not use DOM/Node APIs)
npm run build        # typecheck + production build
npm run bots -- --games 200 --seed 1   # headless balance table; exit code 1 if a strategy wins >60%
npm run bots -- --trace mixed --seed 3 # one bot game turn by turn
npm run art          # regenerate placeholder pixel art into public/assets (overwrites it)
```

Open a specific city with `http://localhost:5173/?seed=7`.

## Source of truth

[CONCEPT.md](CONCEPT.md) (in Russian) is the authoritative spec and is meant to drive code, content and art generation. Read it before implementing anything. Its rules are mandatory unless the user says otherwise; numbers marked «стартовые» are initial balance values and belong in JSON, not code. Keep CONCEPT.md updated when the user changes the design — it should describe the game only (no market analysis or other side material).

The user communicates in Russian; UI text and content are in Russian, code identifiers and comments in English.

Never edit files through PowerShell `Get-Content`/`Set-Content` pipelines: Windows PowerShell 5.1 corrupts UTF-8 Cyrillic. Use the Edit/Write tools.

## Architecture

- `src/sim/` — the whole game: pure TypeScript, deterministic, JSON-serializable `GameState`. Entry points in `index.ts`: `createGame(content, seed)`, `playTurn(state, content, decision)` → `TurnReport`, `listPurchases`/`purchase`, `previewPublication` (what UI and bots show before publishing). `tsconfig.sim.json` enforces no DOM/Node APIs here.
  - Turn order (`game.ts`): exposure decay → late exposures of old lies → publish each card (`news.ts`: reach → belief → effects → word of mouth) → fact-check → ad income/upkeep (`economy.ts`) → next turn: city day (`city.ts`), real events become true cards, deal hand → outcome check.
  - All randomness goes through `rng.ts` with the state stored in `GameState.rng`; never use `Math.random` in sim.
  - Upgrades never mutate state directly; their effects are recomputed by `getModifiers()` from `state.upgrades`.
  - Resident ids equal their index in `state.residents`, building ids their index in `state.buildings`.
- `src/content/*.json` — all cards, channels, upgrades, groups, buildings and balance numbers. `validateContent()` (run in tests) checks consistency, e.g. card `titles`/`effects` are indexed by truth level and must be `null` below `baseTruth`.
  - Map (`map.ts`): every third tile row/column is a road; lots between roads hold one 2×2 building or `smallPerLot` 1×1 buildings; `x, y` of a building is the top tile of its footprint.
- `src/render/` — PixiJS city (`scene.ts`), purely presentational. It rebuilds the map when the seed changes, swaps building sprites by state, and runs cosmetic resident agents (daily routine over a BFS road graph, leaving with suitcases, protests at the city hall, reactions from `state.lastReactions` after a turn). Cosmetic randomness may use `Math.random`. Zoom is integer in device pixels (crisp pixel art); below ×1 it fits to the screen.
- `src/ui/` — plain DOM UI (`dom.ts` `h()` helper). `app.ts` builds a persistent shell once (the Pixi canvas is never re-rendered) and re-renders the HUD/sidebar/modal on every change. Styling only via CSS variables in `style.css` (palette colors).
- `tools/art/` — procedural placeholder art generator: palette-indexed `Raster`, isometric primitives (`iso.ts`), buildings, 16×16 residents with the fixed 17-row sheet (`characters.ts` `ROWS` must match CONCEPT.md §7.2), tiles/decor/fx. It writes PNG + PixiJS JSON atlases and `manifest.json`; the renderer loads whatever the manifest lists, so a designer can replace files 1:1.
- `tools/bots.ts` — strategy bots for balance checks; `mixed` approximates a thoughtful player. After balance changes, rerun the bots and compare.

Planned stack beyond this stage (CONCEPT.md §6): Preact/Svelte UI, Electron + steamworks.js, Capacitor.
