# Phase 2 — rooms and orchestration

Local implementation on `phase-2-rooms`, stacked on `phase-1-foundation`. No PR opened; not release-ready.

## Behavior and review

1. Start the app as in phase 1, connect a provider, and fetch models.
2. Open Rooms, name the room, and describe its objective.
3. Add any number of model participants. Choose role presets or edit role names and system prompts before adding each participant. Models may repeat with different roles.
4. Choose round-robin, moderator-led (requires a Lead), debate → summary (requires a Summarizer), or free-form brainstorm (randomized non-consecutive speakers).
5. Set a turn cap, start, and observe text streaming. Every turn receives the full labeled transcript. No tool execution is provided.
6. Pause or send a redirect. Partial responses remain visible; resume explicitly.
7. Start a new room to change the team after conversation begins. This phase is memory-only; reload loses rooms.

Moderator output must end in a valid NEXT directive. Invalid routing pauses rather than inventing a selection. Provider errors pause without automatic retries.

## Actual verification

Node 25.8.0/macOS: 27 tests passed (19 provider tests plus 8 orchestration tests); syntax checks passed. Simulated orchestration verifies shared history, turn caps, duplicate-start exclusion, redirection, debate synthesis order, moderator routing/rejection, and fail-before-inference hooks.

Desktop Codex in-app browser: Rooms view, role controls, initial empty state, and navigation inspected. Live streaming with real providers and real multi-model discussion remain untested. Other browsers, physical phones, and fresh accounts remain untested.

## Risks

No persisted rooms, token budgeting, or loop detection yet. Whole transcripts can exceed model context limits; provider failures pause the run. A 1,024-token output cap is not a billing guarantee. Prompt injection by participants cannot be fully prevented by labeling. Do not put secrets into shared prompts. Brainstorm is randomized speaker selection, not autonomous concurrent conversation. Role prompts are editable when assembling the team; editing an existing member in place is not yet implemented.

Name candidates remain Manyfold Table, Council Weave, and Roundloom; none are trademark-cleared. Generic workspace branding remains in use. See phase 1 for security and licensing notes.

## Review submission update

Product name: **Knights Circle**, selected by Paul; earlier name candidates are superseded. Trademark clearance remains unverified. Target repository: python1/knights-circle, base main. Draft phase snapshots are cumulative and overlap; review/merge in phase order and rebase later PRs after earlier merges. Local test evidence above is separate from GitHub CI and Vercel live verification. Paul controls deployment; no live provider acceptance has been claimed.
