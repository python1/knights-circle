# Phase 3 — local memory and safety controls

Local implementation on `phase-3-memory-cost`, stacked on phase 2. No PR opened. **Hard billing caps and accurate live dollar metering are not complete.**

## Review steps

1. Create a room and click Save room. Reload; search its name/objective to reopen it. Reconnect provider credentials separately.
2. Run a short conversation. Completed turns save automatically; search a phrase from its transcript.
3. Inspect per-participant input/output token counts when supplied by the provider.
4. Set a $0.30 allocation cap and $0.10 per-request allocation. A fourth paid request must not be sent after three allocations. This is a request-allocation cap, not a provider billing guarantee.
5. Open the same room in two tabs and attempt simultaneous runs; Web Locks should exclude the second runner. Browsers without Web Locks fail closed.
6. Simulate storage failure: inference must not begin if its reservation cannot be saved. Interrupted requests retain their allocation.
7. Three identical substantive model replies pause the room. This catches exact repetition, not all semantic loops.

## Actual verification

Node 25.8.0/macOS: 35 tests passed. Added tests cover credential-field exclusion, allocation rounding/caps, invalid allocations, storage failure, interrupted-state recovery, loop detection, and token aggregation. No live provider/cross-tab/browser persistence test has yet been completed for this phase. Browser/device matrix remains as documented in earlier phases.

## Limits and risks

Room content is plaintext in localStorage on this browser, not cloud-synced account memory. API keys are excluded by an explicit field allowlist. Users can still place secrets in free-text prompts; do not do so. Browser storage can be evicted. Save/export important records.

Provider price catalogs, model tokenization, reasoning charges, request retries outside this app, and independent account use prevent treating local estimates as authoritative dollar caps. Set provider-side limits. This implementation deliberately labels allocations separately; the requested hard spend guarantee remains unresolved. Token usage arrives when a provider emits it, often only at stream completion.

Cross-tab run locks do not yet prevent stale manual saves overwriting newer data. Schema migration, backup/import, history management/deletion, and robust conflict resolution need further work before release.

Name candidates: Manyfold Table, Council Weave, Roundloom. No trademark clearance has been performed. Generic branding remains.

## Review submission update

Product name: **Knights Circle**, selected by Paul; earlier name candidates are superseded. Trademark clearance remains unverified. Target repository: python1/knights-circle, base main. Draft phase snapshots are cumulative and overlap; review/merge in phase order and rebase later PRs after earlier merges. Local test evidence above is separate from GitHub CI and Vercel live verification. Paul controls deployment; no live provider acceptance has been claimed.
