# Phase 4 — export, read-only snapshots, and PWA shell

Local implementation, stacked on phase 3. Not release-ready; live validation pending Paul's Vercel preview.

## Review steps

1. Open a saved room. Export Markdown and check its objective, speakers, and full text.
2. Choose Print / save PDF and select the browser's Save as PDF destination. Verify page breaks and Unicode. PDF generation uses browser printing, not a server or external service.
3. Create a read-only link. Review the transcript before sending it. Open in a clean browser profile: transcript should render without connection credentials or edit controls.
4. The snapshot is contained in the URL fragment; it is not uploaded to an application database. Anyone with the link can read it, and links cannot be revoked. Large snapshots are rejected with a Markdown fallback. Localhost links work only on the same device; public links require Paul's hosted preview.
5. On a supported browser/HTTPS preview, install the workspace using browser installation controls. Load it once, go offline, and verify saved-room access. Inference needs connectivity except locally reachable Ollama.
6. Verify no provider traffic is cached by the service worker. Only explicit same-origin app-shell paths are eligible; requests with queries are excluded.

## Actual verification — October 29, 2026

Node 25.8.0/macOS: 45 tests passed. Includes Unicode snapshot roundtrip, sensitive-field exclusion, malformed/oversized links, Markdown escaping, PKCE/state/expiry checks, multiline SSE, and premature stream termination. All scripted syntax checks passed.

Codex in-app browser/macOS: saved a room, reloaded, reopened it, added a user redirect, generated a snapshot link, and opened its read-only view. Provider page visually inspected at 390 × 844 emulation earlier. No actual providers or physical phones used.

Untested: PDF print output, download integrity through browser UI, PWA installation/offline lifecycle, standalone Chrome/Safari/Firefox, real provider streaming/OAuth, fresh accounts, public HTTPS, Vercel headers, mobile local-network access, and cross-tab concurrency.

## Known gaps

This phase also hardens SSE termination, adds role editing before starting, and persists an interrupted turn marker before dispatch to avoid silently losing attempted turns after a crash. Further clean separation of these fixes into earlier PRs may be warranted during review.

Billing caps/live dollar meter remain incomplete as documented in phase 3. Public sharing is an immutable URL snapshot, not a hosted revocable share record. Persistent memory is browser-local, not account-synced. The PWA manifest needs actual install testing and likely raster icon variants for broader browser compatibility.

Product name: Knights Circle, selected by Paul. This records the product decision, not legal trademark clearance. Created by Paul Charydczak. No third-party dependencies/assets were added.

## Review submission update

Product name: **Knights Circle**, selected by Paul; earlier name candidates are superseded. Trademark clearance remains unverified. Target repository: python1/knights-circle, base main. Draft phase snapshots are cumulative and overlap; review/merge in phase order and rebase later PRs after earlier merges. Local test evidence above is separate from GitHub CI and Vercel live verification. Paul controls deployment; no live provider acceptance has been claimed.
