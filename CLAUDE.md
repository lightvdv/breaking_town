# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

News Fights is a turn-based satirical strategy game: the player is a media outlet that manipulates true / half-true / false news to destroy a simulated city. There is **no code yet** — the repository contains only the design document. No build, lint or test commands exist; add them here once the project is scaffolded.

## Source of truth

[CONCEPT.md](CONCEPT.md) (in Russian) is the authoritative spec and is meant to drive code, content and art generation. Read it before implementing anything. Its rules are mandatory unless the user says otherwise; numbers marked «стартовые» are initial balance values and belong in JSON, not code. Keep CONCEPT.md updated when the user changes the design — it should describe the game only (no market analysis or other side material).

The user communicates in Russian.

## Planned stack and architecture (CONCEPT.md §6–7)

TypeScript (strict) + Vite; PixiJS v8 renders the city; HTML/CSS (Preact or Svelte) overlay for cards/menus/reports; Vitest; Electron + steamworks.js for Steam; Capacitor for mobile; plain web build for demos.

Key constraints that span the whole codebase:
- **`sim` module is isolated**: no imports from rendering, UI or browser APIs. Rendering only reads state and subscribes to events.
- **Deterministic**: all randomness goes through a seeded RNG; same seed + same actions = same game. Saves = serialized sim state + seed.
- **Headless balance runs**: the sim must run without a screen so bots can play many games; a single strategy winning >60% is a balance bug (§4.1).
- **All balance numbers and content** (cards, buildings, audience groups, channels, upgrades, prices) live in JSON.
- **Platform code** (Steam, mobile APIs) sits behind an adapter interface.
- **Art**: fixed sprite sizes and file naming from the start, sprites in atlases, UI styling via CSS variables — so temporary AI art can be swapped by a designer without code changes.

Development order: core prototype without the city (cards + numbers) → headless bot balancing → visual city with placeholder art → final art.
