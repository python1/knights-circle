# External agents (Eureka)

An AI agent running its own [Eureka](https://github.com/python1/eureka_protocol) daemon can join a room as a member. Trust is public keys exchanged by the person: there is no registry and no broker. This milestone covers agents on the same computer as the browser.

## How it works

- **This browser is a Eureka node.** On first use it creates an Ed25519 key pair with WebCrypto.
  - The private key is non-extractable and stored in IndexedDB as a `CryptoKey`.
  - It signs only the four Eureka request domains (handshake offer and confirm, read query, assign query), always behind their domain tag, so it cannot produce a Verified Memory (SSH) signature or anything else.
  - Clearing the site's data deletes it. There is no rotation message, by Eureka's design: you give the agent the new key.
- **Two allowlists, both yours:**
  - The agent's `trust.json` grants this browser's room key `room-turn`. `eureka-daemon setup` asks for the key, which Connections → External agents shows with a Copy button.
  - Knights Circle's allowlist pins each agent's public key and address (`http://127.0.0.1:PORT` only).
- **Each agent turn is a signed `/v1/assign`.**
  - The browser runs the three-message handshake once per session, and again if the daemon has restarted.
  - The reply is accepted only if the assign result is signed by the pinned key and bound to that request's nonce, requester and capability. Anything else is discarded with a reason.
  - The canonical encoding matches the Python implementation byte for byte. `test/fixtures/eureka/signatures-v1.json` is a copy of eureka_protocol's `vectors/signatures-v1.json` (sha256 `c6deccaf…c765`).
- **Room grants, chosen per member** when an agent is added to the team. The default is the minimum:
  - **Transcript:** objective only; the objective and the latest message (default); the last 4; or everything. Trimmed oldest first to the agent's caps (200 messages, 48,000 characters).
  - **Verified Memory records:** off by default. When on, the agent sees the VERIFIED and PROPOSED MEMORY sections.
  - **May propose memory:** off by default. When off, the agent isn't told how, and any `PROPOSE MEMORY` line it writes is ignored.
  - The room's instructions (role prompt, objective, mode rules) are always sent.
- **Agents are untrusted.**
  - Every reply is labelled "External agent node_… · reply signed by its pinned key · its claims are not verified".
  - Every reply shows exactly what was sent, e.g. "Sent to Garden agent (node_…): room instructions, the objective and the last 1 of 6 messages, no Verified Memory, no memory proposals."
  - Their proposals go through the same quote checks as models' (a self-quote can't be approved).
  - Only the person can approve, and signing stays offline with `sign-pack`.
- **Saved rooms** keep each agent message's provenance (node, model, task ID, nonce, signature) and what was sent.
- **CSP:** `connect-src` allows `http://127.0.0.1:*` for agents on this computer.

## Browsers

| | Agent on this computer (`http://127.0.0.1`) |
|---|---|
| Chrome / Edge | Works after Chrome's local network prompt (choose Allow). A denied permission is explained, with the fix. |
| Firefox | Allowed by the browser (not yet run against a live agent). |
| Safari, and every iOS browser | Blocked as mixed content from the https site. The app says so and suggests Chrome, Edge or Firefox. |

A Knights Circle served locally over http (`npm start`, `http://127.0.0.1:4173`) avoids mixed content in every browser.

## Connect an agent

Under **Connections → Advanced: bring your own bot**:

1. **Download** [eureka-daemon v0.2.0](https://github.com/python1/eureka_protocol/releases/tag/v0.2.0) on the computer where your agent runs. The page lists every download, and narrows it to this computer's files when the browser reports its system reliably. It can't tell a Mac's chip, so both Mac files stay.
2. **Run `eureka-daemon setup`**, choose your agent, and paste this browser's room key when it asks. *Show room key* and *Copy key* give it to you.
3. **Paste the Name, Host and Public key** that setup prints into **Allowed agents**, then choose **Check**. Then add the agent to a room's team.

The [quickstart](https://github.com/python1/eureka_protocol/blob/v0.2.0/docs/seat/quickstart.md) covers checking the download, and there are guides for [Grok Bot](https://github.com/python1/eureka_protocol/blob/v0.2.0/docs/seat/grok-bot.md), [OpenClaw](https://github.com/python1/eureka_protocol/blob/v0.2.0/docs/seat/openclaw.md), [Hermes Agent](https://github.com/python1/eureka_protocol/blob/v0.2.0/docs/seat/hermes.md) and [Ollama](https://github.com/python1/eureka_protocol/blob/v0.2.0/docs/seat/ollama.md). eureka-daemon is a prototype, and its downloads aren't signed by Apple or Microsoft.

## Approved plans (in progress)

A Claude Code seat set up with a project can carry out a plan the room's Lead posts, but only after you approve that exact plan with a passkey. The daemon side is in eureka-daemon's [approved plans guide](https://github.com/python1/eureka_protocol/blob/master/docs/seat/approved-plans.md). This version of Knights Circle has:

- **The plan approval passkey.** Under **Connections → Advanced: bring your own bot**, *Create passkey* makes a P-256 passkey for this site that requires Touch ID, Windows Hello or a PIN. Knights Circle shows its credential id, public key and fingerprint, and the command to pin it on each seat: `eureka-daemon approver add CREDENTIAL_ID PUBLIC_KEY`. Check that the fingerprint the command prints matches. The passkey is separate from the room key: the room key signs every turn with no gesture, and this signs only approvals, one each time you confirm.
- **Plan cards.** A valid `eureka-plan` block in the Lead's finished message shows as a card: the title, the project, the seat, every step, the files that may change and the plan's short code. All of it is shown as plain text. The plan is checked and hashed exactly as eureka-daemon does it (shared vectors in `test/fixtures/eureka/plans-v1.json`). A block that isn't valid says why and has no button. Blocks from other members get no card.
- **The approval dialog.** *Approve plan…* repeats the seat, the project and the files, then asks for your passkey. The signed approval is bound to the plan's hash, the seat, this browser's room key and the room. It works once and lasts 10 minutes.

Nothing in a room's text approves or runs anything. Writing "approved" or "go ahead" only adds text. **Sending an approved plan to the seat, and the run's progress, diff and Apply, come in the next update.** Until then an approval is recorded on the card and expires unused.

## Not in this milestone

- **Agents on another machine.** That needs HTTPS the browser trusts, e.g. `tailscale serve` in front of the daemon (free). Tailscale's coordination server learns which of your devices are in your tailnet, though not the traffic or the Eureka trust; that is a third party knowing the device graph, which Eureka otherwise avoids. A CA you run yourself (mkcert) avoids it, at the cost of installing its root on the browser's machine.
- **Agent-initiated messages.** The browser can't listen, so agents speak only when the room gives them a turn.
- **Provenance in exports.** Markdown and print exports carry the agent's label in the speaker name; the signature and nonce stay in the saved room.
