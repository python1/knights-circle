# Phase 1 — foundation and providers

Status: draft review candidate for python1/knights-circle, base main. No deployment, merge, or release performed. Live verification awaits Paul’s Vercel preview.

## What it does

Responsive provider workbench with six provider adapters, live model discovery, a user-triggered streaming test, cancellation, and sanitized failures. OpenRouter OAuth uses PKCE with state checking. BYOK keys stay in tab memory only. Public attribution is “Created by Paul Charydczak”. No invented accounts or successful connections appear in the UI.

## Review steps

1. Run `npm test` and `npm run check` with Node 22+.
2. Run `npm run dev`; open http://127.0.0.1:4173 in a clean browser profile.
3. Open a provider. Fetch without a key: expect a helpful validation message.
4. Enter your own disposable, restricted key directly into the app, fetch models, choose a text-capable model, then send the small test. The test can incur provider charges; the 256-token output limit is not a dollar cap.
5. Stop a response and verify partial content remains. Cancellation cannot retract work already billed.
6. Disconnect. Reload and verify no connection or key persists.
7. For OpenRouter, sign in, return, fetch models, and perform a test. Try denied sign-in and invalid/expired callback state.
8. With Ollama installed locally, allow the exact app origin using OLLAMA_ORIGINS, then verify a downloaded model. Do not open it to all origins for convenience.
9. Check keyboard navigation, visible focus, modal dismissal, and layouts at 390px and desktop widths.

## Actual verification — October 29, 2026

- Node.js 25.8.0 on macOS: 19 automated tests passed; syntax checks passed.
- Tests use simulated HTTP/stream fixtures for all six providers. They cover request destination/header handling, blocked redirects/cookies, sanitized errors, Unicode fragmentation, NDJSON, and cancellation.
- Codex in-app browser on desktop macOS: page loaded, provider modal opened, missing-key validation confirmed.
- Same browser at 390 × 844 viewport: provider-card layout visually inspected. This is viewport emulation, not a physical phone.
- No paid inference, valid provider account, OAuth completion, local Ollama inference, physical phone, Safari, Firefox, standalone Chrome, assistive technology, or public HTTPS environment tested.

## Risks and remaining work

- Browser CORS support, provider model compatibility, pricing/usage schemas, and live credentials remain unverified.
- OAuth callback failures and full sign-in need automated coverage plus a fresh-account run.
- The SSE decoder currently expects each JSON event on one data line; general multiline SSE and abrupt stream termination need hardening.
- No production authentication, rooms, persistence, cost ceiling, exports, sharing, or PWA in this phase.
- In-memory credentials reduce persistence risk but remain exposed to compromised origin scripts/extensions. Read README security notes.
- Name suggestions: “Manyfold Table”, “Council Weave”, “Roundloom”. These are brainstorming candidates, **not trademark-cleared names**. No claim of trademark freedom is made. Keep generic workspace branding until clearance.

Product update: Paul selected **Knights Circle**. Earlier brainstorming names are superseded. No trademark-clearance claim is made. Vercel configuration and CI were prepared, not deployed; GitHub-hosted CI has not yet been observed.
