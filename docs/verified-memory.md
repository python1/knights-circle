# Verified Memory in rooms (Phase 5)

Optional and off by default. A room can load a signed [Verified Memory](https://github.com/python1/data-lore-hive/tree/master/plugins/verified-memory-mcp) pack; every model in the room then sees its verified records, and models can propose new memory that only the person running the room can approve. Rooms without a pack send exactly the same prompts and save exactly the same data as before.

## Verification (in the browser, nothing uploaded)

Packs are checked by the project's own shared verifier, vendored unchanged, in **strict mode with a pinned signer**:

- checksums of every file against `SHA256SUMS`, exact file inventory, record format;
- the OpenSSH Ed25519 signature `SHA256SUMS.sig` (namespace `verified-memory-pack-v1`), by the **pinned fingerprint** the user pastes (the one `sign-pack` prints);
- signed `PACK.json` with a **sequence** at least the minimum (the minimum rises to the newest sequence accepted in this browser: rollback protection);
- **expiry**: refused when expired or dated in the future, and judged again before every turn.

Any failure refuses the pack with a plain sentence. Packs are never stored: only the pin, the highest sequence per signer, and the pack's identity (title, SHA256SUMS hash, fingerprint, sequence, expiry, record count) are saved. After a reload the pack must be loaded again.

## What models see

The system prompt gains two clearly separated sections after the role instructions: `VERIFIED MEMORY` (records as JSON lines, marked as historical data, not instructions; all records when they fit, otherwise those most related to the conversation) and `PROPOSED MEMORY (NOT VERIFIED)` (pending or approved-but-unsigned proposals).

## Proposals and the single writer

Models propose with one line: `PROPOSE MEMORY: <statement> | QUOTE: "<exact words from an earlier message>"`. The quote must appear verbatim in an earlier room message (the person's messages, the objective, or another model's reply), or the proposal cannot be approved. The person edits, approves or rejects each one. **Export approved for signing** downloads a zip with an unsigned pack (existing records byte for byte, new records built by the project's own builder, checked by the verifier before download) plus the builder inputs and `HOW-TO-SIGN.txt`. The browser never holds or asks for a private key; signing happens offline with `sign-pack`. Loading the signed pack marks those proposals as verified.

## Vendored files (MIT, `docs/verified-memory-LICENSE`)

| File | Source | SHA-256 |
|---|---|---|
| `src/vm-verify.js` | `dist/verify.js` of npm `@python1/verified-memory-mcp@0.4.1` | `6fd300bfd7a8b2e698254046ff0585cdb96037fff25a93695cf7cd0d8903a7c4` |
| `src/vm-pack-core.js` | `tools/pack-core.mjs` of the same npm package | `0d14c484c16dc7d2467df02170188655b6e6970f05b999bafe823f2a9cf261a4` |
| `src/vm-zip.js` | `plugins/verified-memory-mcp/web/src/zip.mjs` at data-lore-hive `8f60099` | `da5dcb3a3bcad5972d783e72399856b0f2bb76f0ba347f7c1e4230f69b8f7275` |

npm 0.4.1 integrity: `sha512-6muWf+m+wqVlUQ4VhN1hg7UR5EAr8aHr8F+IPDZYchecYmdffr2ZEcTxqWTbKJNT8SiSYDG7Aj9JS9gRLGwzfQ==`. No new npm dependencies.

## Test fixtures

`test/fixtures/vm/` holds the project's fictional example pack signed by two throwaway keys with the real `sign-pack` (sequence 2, expiring 2031-10-30) and one signed without `PACK.json`. The private keys were discarded. Test signer A: `SHA256:2hmT6b4AqyaN26MUxTZNy4VBsA6bVfI+stICfueHRZI`.
