# Wayfare — notes for coding agents

Monorepo (npm workspaces: `packages/shared`, `apps/api`, `apps/web`). `apps/mobile` (Expo) has its own `node_modules`, outside the workspaces. `apps/ios` is SwiftUI generated with XcodeGen.

## Commands
- `npm run typecheck`: API, web, shared and mobile
- `npm run build`: web production build (`apps/web/dist`, served by the Worker)
- `npm run dev:api` / `npm run dev:web`: run both for local development
- After changing `apps/api/src/db/schema.ts`: `npm run db:generate -w @wayfare/api`, then `npm run db:migrate:local`

## Conventions
- Validate every API input with a Zod schema from `packages/shared` and reuse it in the clients.
- Every trip route checks access with `requireTripRole(db, tripId, userId, minRole)`. It returns 404 when the user has no access.
- Places are user-owned. Trips reference them through `trip_places`. Never delete places as a side effect.
- AI and imported content is untrusted. Validate it and keep it in proposals or "needs review" candidates until the user confirms.
- Broadcast trip changes with `broadcast(env, tripId, event)` so collaborators refresh.
- Never send PII to analytics. `track()` hashes the user id and respects the opt-out.
- Web styling: Tailwind v4 utilities defined with `@utility` in `apps/web/src/index.css` (`btn-primary`, `card`, `input`, `chip`, …).
