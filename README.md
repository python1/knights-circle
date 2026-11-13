# Knights Circle

Created by Paul Charydczak.

**Support this project:** https://buymeacoffee.com/python1

Try it: https://knights-circle.vercel.app

A shared room where several AI models, each with its own role, work on one objective together. It runs in your browser with your own provider keys or a local Ollama, and nothing is sent to a Knights Circle server.

## Run locally

Requires Node.js 22 or newer. No npm dependencies or installation required.

```sh
npm run dev
# Open http://127.0.0.1:4173
npm test
npm run check
```

The development server binds only to loopback. It is not production hosting. Keep its response security headers when preparing production hosting.

## Credential boundary

API keys live only in a JavaScript Map in the current browser tab. They are never stored in localStorage, IndexedDB, cookies, or on the application server. Closing/reloading the page removes app access to the keys. JavaScript cannot promise secure erasure from process memory. The temporary OAuth PKCE verifier/state uses sessionStorage and is consumed on callback; it is not a provider API key. OAuth uses SHA-256 PKCE, random state, and a ten-minute local expiry.

Inference and catalog requests go directly to fixed provider origins, with keys in headers, no cookies, and redirects rejected. There is no telemetry, remote font, CDN script, or request logging; the two fonts are served from this site. Provider response error bodies are not displayed or logged. Browser developer tools and extensions may still observe requests. Any script compromise of the app origin can expose in-memory keys. Users must supply their own credentials; never embed a developer/shared key.

This is a client-side bring-your-own-key design. OpenAI recommends keeping secrets on servers. A relay would receive the user's credential, conflicting with the strict requirement that it only be sent to the provider; no relay is implemented.

Ollama targets only http://127.0.0.1:11434, requires an installed/running local instance and origin configuration. HTTPS public pages, browser local-network permissions, CORS, and mobile device access require real testing. A phone's loopback is not a desktop's loopback.

Browsers differ here. From the https site, Safari (and every iOS browser, all WebKit) blocks requests to http://127.0.0.1 as mixed content, so local Ollama works only in Chromium browsers and Firefox. Chrome first asks for local network access, and a declined prompt blocks the request. The connection guide detects both cases instead of reporting that Ollama is off. Checked in Safari 26.3.1 and Chrome 156 on macOS (October 2026).

## Features

- **Provider connections:** model catalogs, OpenRouter sign-in (PKCE), your own keys, streaming.
- **Rooms:** roles, one shared transcript, pause and redirect, and four modes: round-robin, moderator-led, debate → summary, and brainstorm.
- **Memory and cost controls:** saved rooms with search, per-room cost allocation, and repetition limits.
- **Export and sharing:** Markdown and PDF export, read-only snapshot links, and an installable offline shell.
- **Verified Memory:** signed packs checked in the browser, labelled proposals, and export for offline signing (`docs/verified-memory.md`).
- **External agents (Eureka):** agents on this computer join rooms over a signed handshake, with per-member grants (`docs/external-agents.md`).

## Limits

- **Your data:** saved rooms are plain text in this browser's local storage. They are not synced or backed up, and the browser can evict them, so export what matters. API keys are never saved.
- **Cost controls:** a room's cost cap limits what the app allocates per request. It is not a provider billing guarantee, so also set limits with each provider.
- **Context and repetition:** every turn sends the whole transcript, which can exceed a model's context limit. Repetition detection catches identical replies only.
- **Prompt injection:** models see each other's replies. Labelling reduces prompt injection but cannot prevent it, so don't put secrets in room prompts.
- **Share links:** a link carries its snapshot in the URL fragment. Anyone with the link can read it, and it cannot be revoked.

## License

Knights Circle
Copyright (C) 2026 Paul Charydczak

Licensed under the GNU Affero General Public License, version 3 only
(SPDX-License-Identifier: AGPL-3.0-only). The full license text is in [LICENSE](LICENSE).
Third-party files keep their own licenses: see [License credits](#license-credits) below.

## License credits

The Verified Memory verifier, pack builder and zip helper (`src/vm-verify.js`, `src/vm-pack-core.js`, `src/vm-zip.js`) are vendored unchanged under the MIT License (`docs/verified-memory-LICENSE`; see `docs/verified-memory.md`). No other third-party runtime packages, copied assets, or SDK source are included, except two fonts self-hosted in `fonts/`: Plus Jakarta Sans (The Plus Jakarta Sans Project Authors) and JetBrains Mono (The JetBrains Mono Project Authors), both under the SIL Open Font License 1.1 (`fonts/OFL-*.txt`), latin subsets taken from the @fontsource-variable 5.3.0 packages. They load only from this site (`font-src 'self'`). Provider names appear only to identify integrations and do not form the product name. License/NOTICE files of any future dependencies must be retained.

## Official integration references

- https://openrouter.ai/docs/guides/overview/auth/oauth
- https://developers.openai.com/api/reference/overview
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://platform.claude.com/docs/en/api/messages
- https://ai.google.dev/api/generate-content
- https://docs.x.ai/developers/rest-api-reference
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/faq

## Hosting

`npm run build` copies only allowlisted app assets to `dist/`. Security headers for Vercel are defined in `vercel.json`.
