# STACK//LAB — Versus

A browser-only, local versus block-stacking game with configurable handling, SRS+ rotations, spins, garbage attacks, and three AI opponents.

## Run locally

Open `index.html` in a modern browser. There is no build step, package installation, server, or backend.

## Deploy on Vercel

Import this repository and use the repository root (`./`) as the Root Directory. Leave the Framework Preset as **Other**, and leave Build Command and Output Directory empty. Vercel will serve `index.html` as a static site.

## Controls

| Action | Key |
| --- | --- |
| Move left / right | ← / → |
| Soft drop | ↓ |
| Hard drop | Space |
| Rotate counter-clockwise / clockwise | Z / X |
| Rotate 180° | A |
| Hold | C |
| Pause / resume | P |
| Restart match | R |

Touch controls are available on smaller screens.

## Handling

DAS, ARR, and SDF can be tuned in the left panel and persist in local storage. DAS and ARR both support a zero-delay instant setting; SDF includes an infinite/instant setting. Optional DAS cancellation resets charge when switching direction.

## Rotation and scoring

- JLSTZ pieces use standard SRS quarter-turn kick tests.
- The I-piece uses the symmetric five-test SRS+ quarter-turn kick tables.
- 180° rotation uses its own ordered kick tests.
- T-spins and mini T-spins are detected with the three-corner rule, front-corner check, and kick upgrade.
- Line clears, combos, and back-to-back clears contribute to garbage attacks.

## Versus match

Three local AI opponents place pieces on independent fields, build stacks, clear lines, send garbage, and can top out. Garbage can be cancelled by your outgoing attack before it reaches your field. No multiplayer server or account is required.

## Project files

- `index.html` — interface and canvas elements
- `styles.css` — layout, themes, and responsive styling
- `game.js` — game loop, rotation, handling, combat, AI, and rendering
