# Wayfare — Trip & Holiday Planner

Save travel inspiration from links, screenshots and searches, then organize it into collections, see it on a map, and turn it into AI-assisted day-by-day itineraries you can edit and share.

The functional spec this implements is in the original product document (Rhyme-style trip planner). The product is named **Wayfare** so it doesn't reuse another company's brand.

## Repository layout

| Path | What | Stack |
|---|---|---|
| `apps/api` | API, auth, jobs, realtime. Also serves the built web app | Cloudflare Workers + Hono, D1 (Drizzle), R2, KV, Durable Objects, Queues, Workflows, AI Gateway, Better Auth, Stripe, Superwall webhooks, Tinybird |
| `apps/web` | Web app | React 19 + Vite, React Router, TanStack Query, Tailwind v4, MapLibre (OpenFreeMap tiles, no key) |
| `apps/mobile` | Android app (also runs on iOS) | Expo SDK 58 / React Native, expo-router, react-native-maps, expo-superwall |
| `apps/ios` | Native iOS app | SwiftUI, MapKit, SuperwallKit (XcodeGen project) |
| `packages/shared` | Zod input schemas, response types, helpers | Used by the API, web and mobile apps |
| `tinybird/` | Analytics datasource + example endpoint | Tinybird |
| `scripts/eval-models.ts` | Ranks OpenRouter models using Artificial Analysis benchmarks | Node |

## How the pieces fit

```
web / Android / iOS ──HTTPS──► Worker (Hono)
                                 ├─ /api/auth/*      Better Auth (cookies for web, bearer tokens for native)
                                 ├─ D1               all relational data (Drizzle schema: apps/api/src/db/schema.ts)
                                 ├─ R2               screenshots (private/<user>/…) and images (media/<unguessable token>)
                                 ├─ KV               geocode cache, monthly quotas, rate limits
                                 ├─ Queue            link/screenshot imports → extract → AI → geocode → "needs review"
                                 ├─ Workflow         itinerary generation (checkpointed steps, retries) → proposal
                                 ├─ Durable Object   one TripRoom per trip: WebSocket presence + change fan-out
                                 ├─ AI Gateway ──►   OpenRouter (DeepSeek default; vision model for screenshots)
                                 │                   or AI_PROVIDER=selfhosted → any OpenAI-compatible server (vLLM on RunPod / Vast.ai)
                                 ├─ Stripe           web checkout, billing portal, webhooks
                                 ├─ Superwall        mobile paywalls; purchases arrive via webhook
                                 └─ Tinybird         product events (hashed user id, no PII, respects opt-out)
```

Key design decisions:

- **AI output is a proposal, not an edit.** Generation writes to `itinerary_proposals`. The user reviews it, then accepts or discards it. If generation fails, the trip and its existing itinerary are untouched. Regenerating one day only replaces that day.
- **AI output is untrusted.** It is validated with Zod. Unknown or duplicate place ids are dropped with a warning. New suggestions are geocoded and shown as "New suggestion". Imported page text is passed to the model as data, with instructions to ignore any commands inside it.
- **Travel times are labelled honestly.** Without `ROUTING_URL` (an OSRM server), legs are straight-line estimates shown with "~". Transit is always an estimate. Opening hours are never invented.
- **Removing ≠ deleting.** Removing a place from a collection or trip leaves it in the library. Deleting a collection or trip never deletes places.
- **Permissions:** owner / editor / viewer per trip. Share links are view-only, revocable and optionally expiring. Making something private revokes its links. Private notes and member emails never appear in public views. Accepting an invite requires a verified email.
- **Push notifications** never include trip names or places, so nothing sensitive shows on a lock screen.

## Local development

Requirements: Node 22+.

```bash
npm install
cp apps/api/dev-vars.example apps/api/.dev.vars   # set BETTER_AUTH_SECRET; add GROQ_API_KEY (or OPENROUTER_API_KEY) for AI features
npm run db:migrate:local
npm run dev:api      # terminal 1 — Worker on port 8787, all interfaces so phones on your Wi-Fi can reach it
npm run dev:web      # terminal 2 — Vite on http://localhost:5173 (proxies /api to the Worker)
```

Open http://localhost:5173. Without an email provider, verification and reset links are printed in the `dev:api` terminal.

What works with no API keys at all: accounts, places, collections, trips, manual itineraries, maps, sharing, invites, realtime collaboration, place search (OpenStreetMap Photon) and Google Maps link imports. AI itineraries and AI extraction from social/web links, pasted text and screenshots need an AI key.

**AI provider.** Set `GROQ_API_KEY` (`GORQ_API_KEY` also works) to use Groq: `openai/gpt-oss-120b` for text and `qwen/qwen3.8-27b` for screenshots, overridable with `GROQ_MODEL` / `GROQ_VISION_MODEL`. Otherwise OpenRouter is used. `AI_PROVIDER=groq|openrouter|selfhosted` forces one.

### Dev mode (R&D: no sign-in, no limits, no paywall)

`DEV_MODE=true` in `apps/api/.dev.vars` makes every request without a session run as a shared test user ("Dev Tester"). That user is already onboarded and on the Pro plan, so sign-in, onboarding, quotas, rate limits and paywalls are all skipped. A real sign-in still works and takes precedence. The web app detects dev mode through `/api/health` and shows a "Dev mode" badge in the sidebar. The mobile apps have matching switches: `extra.devMode` in `apps/mobile/app.json` and `WayfareDevMode` in `apps/ios/project.yml`.

It only activates while `APP_URL` is a localhost URL, so it can't switch on in production. To turn it off, delete the `DEV_MODE` line (and set the two mobile flags to `false`). All bypass code is marked `DEV MODE`; search for it to find every place.

### Mobile (Expo Go)

```bash
npm run dev:api                 # terminal 1 (the Worker must be on port 8787)
cd apps/mobile && npm install
npx expo start                  # terminal 2: scan the QR code with Expo Go (same Wi-Fi as this PC)
```

The app finds the API on the PC that runs Metro (`http://<your LAN IP>:8787`), so there's nothing to configure. Use LAN mode, not `--tunnel`. If the phone can't connect, allow Node/workerd through Windows Firewall on private networks. In Expo Go, Superwall and push notifications are switched off automatically, because they need a development build (`npx expo run:android`). Release builds use `extra.apiUrl` in `app.json`.

### Onboarding quiz (web + mobile)

Both apps open with the same onboarding quiz. The steps, branching, copy and personalised summary live in `packages/shared/src/onboarding.ts` (imported as `@wayfare/shared/onboarding`). `apps/web/src/pages/Onboarding.tsx` and `apps/mobile/app/onboarding.tsx` only render it, so change the flow in the shared file and both apps update. Answers are saved to the profile (`preferences.travelProfile`, interests, pace) and used by the AI itinerary prompt. If the user has a trip coming up, the quiz ends on New Trip with the destination filled in. In dev mode, completion is remembered per browser/device. **Profile → Dev tools → Replay onboarding** runs it again. The social-proof stats and reviews are placeholders: replace them with real ones before launch. No paywall or sign-up is attached yet.

### iOS (SwiftUI)

```bash
brew install xcodegen
cd apps/ios && xcodegen generate && open Wayfare.xcodeproj
```

Set `WayfareAPIURL` and `SuperwallAPIKey` in `project.yml`.

## Deploying (Cloudflare)

```bash
cd apps/api
npx wrangler d1 create wayfare-db            # paste the id into wrangler.jsonc
npx wrangler kv namespace create KV          # paste the id into wrangler.jsonc
npx wrangler r2 bucket create wayfare-media
npx wrangler queues create wayfare-imports && npx wrangler queues create wayfare-imports-dlq
npm run db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET   # and OPENROUTER_API_KEY, STRIPE_*, SUPERWALL_WEBHOOK_SECRET, TINYBIRD_TOKEN, …
cd ../.. && npm run deploy                   # builds the web app and deploys the Worker with it as static assets
```

Set `APP_URL` in `wrangler.jsonc` to your production URL. To use AI Gateway, create a gateway named `wayfare` (or change `AI_GATEWAY_ID`) and set the `CF_ACCOUNT_ID` secret.

Webhooks:

- Stripe → `POST /api/webhooks/stripe` (events: `customer.subscription.*`).
- Superwall → `POST /api/webhooks/superwall`. This uses Svix-style signature verification. Confirm the header and event field names against Superwall's current webhook docs before going live.

### Scaling the database (PlanetScale)

D1 is the primary store. All data access goes through Drizzle, so moving high-volume tables to PlanetScale means writing a MySQL Drizzle schema that mirrors `apps/api/src/db/schema.ts` and pointing `getDb` at a PlanetScale connection (via Hyperdrive or `@planetscale/database`). The application code doesn't need to change. No PlanetScale code ships today.

## Plans and limits

`packages/shared` → `FREE_LIMITS` / `PRO_LIMITS` (AI generations and imports per month). These are placeholders, not Rhyme's pricing. Quotas are tracked in KV per calendar month.

## Choosing models

```bash
ARTIFICIAL_ANALYSIS_API_KEY=... npm run eval:models
```

This prints models available on OpenRouter, ranked by intelligence per dollar. To switch models, change `AI_MODEL` / `AI_VISION_MODEL` in `apps/api/wrangler.jsonc`.

## Known gaps

- **iOS app:** written but not compiled. It was authored on Windows, so expect small fixes in Xcode.
- **Android share-sheet:** "share to Wayfare" from other apps needs a share-intent module such as `expo-share-intent`. Today users paste links or pick screenshots in the app.
- **Instagram:** most Instagram pages need a logged-in session, so link imports often fall back to the review/manual-entry flow. Screenshots work better for Instagram.
- **Legal pages:** `/privacy` and `/terms` are linked but you need to supply the content.
