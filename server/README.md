# Multiplayer server

Deploy this directory as a Railway service with the repository Root Directory set to `/server`.

Required Railway variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Recommended server-only variables:
- `SUPABASE_SERVICE_ROLE_KEY` (saves completed match history; never expose this in the browser)
- `FRONTEND_ORIGIN` (exact Vercel origin)

Railway supplies `PORT`. The service provides `/health` and the signed-in WebSocket endpoint `/ws`.

Run `npm install`, `npm test`, then `npm start` from this directory for local checks.

Rooms and live matches are held in memory. A Railway restart ends active rooms. Profiles, settings and optional results are stored in Supabase.

The game simulation runs in each browser and the server relays bounded board snapshots and attack events. This is a casual-play system, not a cheat-resistant ranked engine; players can modify browser-side simulation state.
