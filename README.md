# STACK//LAB

A browser-only block-stacking game with configurable handling, SRS+ rotations, local singleplayer challenges, and AI botplay.

## Game flow

The app opens to a main menu with **Singleplayer** and **Settings**. Choose a singleplayer mode to start a run:

- **100L Cheese** — clear 100 lines while digging through an uneven starting stack of garbage.
- **40 Line Sprint** — clear 40 lines as quickly as possible.
- **2 Min Blitz** — score as much as possible before the 120-second timer ends.
- **Botplay** — play a 1v1 garbage battle against one of five AI difficulty tiers:
  - Level 1: D–D+
  - Level 2: C−–C
  - Level 3: Low B
  - Level 4: A
  - Level 5: S+

Botplay opponents use placement evaluation; the top tier also looks one piece ahead. Multiplayer is not included yet.

## Controls

Default bindings:

| Action | Key |
| --- | --- |
| Move left / right | ← / → |
| Soft drop | ↓ |
| Hard drop | Space |
| Rotate counter-clockwise / clockwise | Z / X |
| Rotate 180° | A |
| Hold | C |
| Pause / resume | P |
| Restart | R |
| Start / confirm | Enter |

Open **Settings → Edit Keybinds** to remap actions. Assignments are saved in local storage; choosing a key already assigned to another action swaps the two bindings.

Touch controls are available on smaller screens.

## Handling and HUD

DAS, ARR, and SDF can be tuned in Settings. DAS and ARR support instant settings, SDF includes instant/sonic drop, and DAS cancellation is optional. Handling settings persist locally.

Choose which gameplay stats appear under the field in **Settings → Visible Stats**. Available stats include score, lines, time, level, combo, back-to-back, pieces, APM, attack sent, and incoming garbage.

During a run, the interface is intentionally minimal: the playfield, hold piece, next five, selected stats, and (in Botplay) the opponent's field.

## Rotation

- JLSTZ pieces use standard SRS quarter-turn kick tests.
- The I-piece uses the symmetric SRS+ quarter-turn kick tables.
- 180° rotation uses a separate ordered kick test set.
- T-spins and mini T-spins are detected with corner occupancy and rotation/kick information.

## Run locally

Open `index.html` in a modern browser. There is no build step, package installation, server, or backend.

## Deploy on Vercel

Import this repository and use the repository root (`./`) as the Root Directory. Use Framework Preset **Other** and leave Build Command and Output Directory empty. Vercel serves `index.html` as a static site.
