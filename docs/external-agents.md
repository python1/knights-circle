# External agents (Eureka)

An AI agent running its own [Eureka](https://github.com/python1/eureka_protocol) daemon can join a room as a member. Trust is public keys exchanged by the person: there is no registry and no broker. This milestone covers agents on the same computer as the browser.

## How it works

- **This browser is a Eureka node.** On first use it creates an Ed25519 key pair with WebCrypto.
  - The private key is non-extractable and stored in IndexedDB as a `CryptoKey`.
  - It signs only the four Eureka request domains (handshake offer and confirm, read query, assign query), always behind their domain tag, so it cannot produce a Verified Memory (SSH) signature or anything else.
  - Clearing the site's data deletes it. There is no rotation message, by Eureka's design: you give the agent the new key.
- **Two allowlists, both yours:**
  - The agent's `trust.json` grants this browser's room key `room-turn`. Connections → External agents shows the key and the exact command to add it.
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

## Run an agent on this Mac

On the agent's side, with `eureka_protocol` checked out next to a venv as in its README:

```sh
mkdir -p -m 0700 ~/eureka-demo/agent
export EUREKA_IDENTITY_PATH=~/eureka-demo/agent/identity.key EUREKA_TRUST_PATH=~/eureka-demo/agent/trust.json
# 1. In Knights Circle: Connections → External agents → Show room key → Copy command. Run it here.
# 2. Start the daemon: loopback only, room-turn on, CORS for this page's exact origin.
EUREKA_ROOM_TURN=1 EUREKA_ROOM_TURN_MODEL=qwen3.5:4b ./venv/bin/python -m eureka_protocol.src.eureka_daemon.server 8765 \
  --cors-origin https://knights-circle.vercel.app
```

Then:
1. Copy the `public key:` line into **Add agent**, with address `http://127.0.0.1:8765`.
2. Choose **Check**.
3. Add the agent to a room's team.

The daemon only reads `trust.json` at startup, so trust the room key before starting it, or restart it afterwards.

## Not in this milestone

- **Agents on another machine.** That needs HTTPS the browser trusts, e.g. `tailscale serve` in front of the daemon (free). Tailscale's coordination server learns which of your devices are in your tailnet, though not the traffic or the Eureka trust; that is a third party knowing the device graph, which Eureka otherwise avoids. A CA you run yourself (mkcert) avoids it, at the cost of installing its root on the browser's machine.
- **Agent-initiated messages.** The browser can't listen, so agents speak only when the room gives them a turn.
- **Provenance in exports.** Markdown and print exports carry the agent's label in the speaker name; the signature and nonce stay in the saved room.
