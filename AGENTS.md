# AGENTS.md

## Cursor Cloud specific instructions

This repo is 四川扯旋/扯开 (CheKai), a real-time multiplayer Chinese poker game with a
front/back split. Two dev processes must run together:

- **Backend** (`server/`): Express + `ws` WebSocket + embedded SQLite (`better-sqlite3`).
  Run from repo root with `npm run dev` (`node --watch server/server.js`). Listens on
  port **3000** (`PORT` env overrides). On first boot it auto-creates `data/chekai.db`,
  runs schema/migrations, and seeds preset accounts — no manual migration step. WebSocket
  is attached to the same HTTP server (`/ws`); there is no separate WS process and no
  external DB daemon.
- **Frontend** (`client/`): Vite + React + pixi.js. Run from `client/` with `npm run dev`.
  Serves on **https://localhost:5173** over a **self-signed cert** (via
  `@vitejs/plugin-basic-ssl`) because the PWA/service worker needs HTTPS off localhost.
  Browsers show a cert warning — click Advanced → Proceed. The client uses same-origin
  relative URLs; Vite proxies `/api`, `/ws`, `/avatars`, `/game` to `127.0.0.1:3000`
  (see `client/vite.config.ts`), so the backend must be up first.

Start order: backend, then frontend.

### Testing / lint / build
- **Tests**: `node server/game-rules.test.js` (self-contained runner, prints `PASS`/`FAIL`
  and exits 0 on success). There is no `test` npm script and no separate lint config.
- **Type/build check (client)**: `npm run build` in `client/` runs `tsc -b && vite build`.
  Note `client/vite.config.ts` has `outDir: '../public'` with `emptyOutDir: false`, so a
  build writes bundles into repo `public/` (the backend also serves `public/` in prod).
  Prefer `npm run dev` for development; only build to type-check or produce prod assets.

### Accounts (seeded in `server/db.js`)
- Admin: `admin` / `admin123` (management console; admins CANNOT create game rooms).
- Players: `zhr`, `wrz`, `my`, `zml`, `zyp`, `mxc`, `syf`, `lql` — all password `123456`.
- The engine needs ≥2 seated players to start a hand. Single-session is enforced: logging
  the same account in twice force-logs-out the earlier session, so use distinct player
  accounts (separate browsers/incognito) for multi-player testing.
