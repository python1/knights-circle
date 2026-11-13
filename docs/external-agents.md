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
  - **Transcript:** objective only; the objective and the latest message (default); the last 4; or everything. Trimmed oldest first to the agent's caps (200 messages, 48,000 characters). An agent added as the **Lead** sees everything by default while a seat in the room runs plans, since a plan needs the whole discussion. Pick a transcript for it to override that; the team list says when the default applies.
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

## Approved plans

A Claude Code seat set up with a project can carry out a plan the room's Lead posts, but only after you approve that exact plan with a passkey. Its changes reach your project only after a second approval, and then as a new branch. The seat side is in eureka-daemon's [approved plans guide](https://github.com/python1/eureka_protocol/blob/master/docs/seat/approved-plans.md).

1. **Create the plan approval passkey** under **Connections → Advanced: bring your own bot**. Knights Circle shows its credential id, public key and fingerprint, and the command to pin it on each seat: `eureka-daemon approver add CREDENTIAL_ID PUBLIC_KEY`. Check that the fingerprint the command prints matches. The passkey is separate from the room key: the room key signs every turn with no gesture, while the passkey signs only approvals, one each time you confirm.
2. **A plan card.** The Lead is told how to write one: when a seat in the room runs plans, Knights Circle asks it which project it has with `plan-info`, a read-only question that can't start anything (older seats get the earlier question; either way the seat's signed answer names the project). It then adds a short note to the Lead's instructions only, with the `eureka-plan` format, that project's name, that `edit` lists only the files to change using the exact paths it was given, and to post the plan once when the team agrees. If the seat's owner chose at setup to share the project's file names (default no), the note also lists the files tracked at its last commit, up to 300 names and never their contents, marked as data from the seat. Otherwise it says: "Ask the owner which files to change." The names go to the Lead's model provider with its turn. Other members, and rooms without such a seat, get nothing new. A valid `eureka-plan` block in the Lead's finished message shows as a card: the title, project, every step, the files that may change and the plan's short code, all as plain text. A block that isn't valid says why. Blocks from other members get no card. One plan at a time: when the Lead posts a newer valid plan for the same project (so the same seat), older cards that were never run say **Replaced by a newer plan**, lose their Approve button, and link to the latest plan with **Jump to latest plan**.
3. **Approve.** The button shows only when the room's seat says it runs plans. Knights Circle asks it first, in a way that can't start anything. Older seats (v0.2.0), seats without a project and seats that don't trust this browser with plans get a note instead. The dialog repeats the seat, project and files, then asks for your passkey. The approval is bound to the plan's hash, the seat, this browser's room key and the room. It works once, for 10 minutes, and is sent to the seat at once.
4. **Running.** The card shows the seat's progress, such as *Editing src/theme.css*: tool names and paths only.
5. **Diff ready.** The card shows Claude Code's summary, the files with lines added and removed, and the diff. Knights Circle checks the diff against the hash the seat signed. **Apply to branch** asks for your passkey again, for this run, this diff and the commit it was made from. The diff then goes on a new branch, `eureka/plan-<code>`, and your checkout isn't touched. **Discard** throws the diff away.
6. **Applied**, or **Failed** with the reason, such as the project having moved on, an existing branch, or a change outside the plan.

Knights Circle shows only what the seat signed with its pinned key, for this plan, this run and this room. Anything else is discarded. Each state change adds a note from Knights Circle to the transcript, holding only the one-line summary. The diff, the files and the progress line stay on the card. The room's members never get them: their turns are built exactly as before, from members' messages only. Markdown and print exports list the approvals and the reports, but not the diff.

Nothing in a room's text approves or runs anything. Writing "approved" or "go ahead" only adds text.

### No Touch ID? Other ways to approve

The seat needs to know it was you, so the passkey must verify you with a PIN, a password or a fingerprint. If this device has no Touch ID, or the passkey prompt fails, you can use:

- **This device's PIN or password:** Windows Hello, or your Mac's login password if Touch ID isn't set up.
- **Your phone:** in the passkey prompt choose *Use a phone or tablet* (or *Other options*), scan the QR code with the phone and approve there. Bluetooth must be on for both. The passkey then lives on the phone, which you use for every approval.
- **A security key**, such as a YubiKey, with a PIN set. A key without a PIN can't verify you, so the seat would refuse its approvals.

Knights Circle shows these options when a passkey can't be created or used. A browser without passkey support can't approve plans: use a current Chrome, Edge, Safari or Firefox.

## Not in this milestone

- **Agents on another machine.** That needs HTTPS the browser trusts, e.g. `tailscale serve` in front of the daemon (free). Tailscale's coordination server learns which of your devices are in your tailnet, though not the traffic or the Eureka trust; that is a third party knowing the device graph, which Eureka otherwise avoids. A CA you run yourself (mkcert) avoids it, at the cost of installing its root on the browser's machine.
- **Agent-initiated messages.** The browser can't listen, so agents speak only when the room gives them a turn.
- **Provenance in exports.** Markdown and print exports carry the agent's label in the speaker name; the signature and nonce stay in the saved room.
