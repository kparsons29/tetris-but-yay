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

Botplay opponents use the Cold Clear engine. Multiplayer adds public 1v1 rooms, spectators, player accounts and cloud-synced settings (Supabase + Railway).

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

Open **Settings → Edit Keybinds** to remap actions. Assignments are saved locally for guests and synced to the signed-in account. Choosing a key already assigned to another action swaps the two bindings.

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


## Multiplayer setup

The multiplayer frontend is included, but it needs Supabase and Railway configured before it can connect.

### Supabase

1. Create a Supabase project.
2. Open **SQL Editor** and run all of `server/schema.sql`.
3. In **Project Settings → API**, copy the project URL and anon/publishable key.
4. In Supabase Auth settings, allow your Vercel domain as a site and redirect URL.

### Browser configuration

Edit `stacklab-config.js` in GitHub and set:
- `supabaseUrl`: your Supabase project URL.
- `supabaseAnonKey`: the public anon/publishable key.
- `multiplayerUrl`: your Railway service URL, using `wss://` (for example `wss://your-service.up.railway.app`).

These are browser-visible values. Never put the Supabase service-role key in this file.

### Railway deployment

1. Create a Railway project from this GitHub repository.
2. Set the service Root Directory to `/server`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Railway Variables.
4. Optionally set `SUPABASE_SERVICE_ROLE_KEY` to save match history. Keep it server-side only.
5. Set `FRONTEND_ORIGIN` to your Vercel site's exact origin.
6. Generate a Railway public domain, then add its `wss://` URL to `multiplayerUrl` in `stacklab-config.js`.

The Railway service exposes `/health` and a signed-in WebSocket endpoint at `/ws`. See [server/README.md](server/README.md) for deployment details.

### Match rules and limitations

- Two player slots per room. Additional members spectate; when a player leaves during the waiting phase, the oldest spectator is promoted.
- Both players must ready up before the three-second countdown. Roles lock once a match starts.
- Active players see their own board on the left; spectators see both players in a stable order.
- The results screen returns to the same room for another round.
- Active room state is held in Railway memory and ends if that service restarts. Profiles, settings and optional result records live in Supabase.
- The game simulation runs in each browser and the server relays bounded board snapshots and attacks. This version is intended for casual public rooms, not cheat-resistant ranked play.
