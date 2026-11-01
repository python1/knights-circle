# Knights Circle

Created by Paul Charydczak.

Unpublished development work. **Not release-ready.** No real-provider or fresh-account verification has been performed. Product name selected by Paul: Knights Circle. Trademark clearance has not been performed.

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

This client-side BYOK design requires security review before public release. OpenAI recommends keeping secrets on servers. A relay would receive the user's credential, conflicting with the strict requirement that it only be sent to the provider; no relay is implemented.

Ollama targets only http://127.0.0.1:11434, requires an installed/running local instance and origin configuration. HTTPS public pages, browser local-network permissions, CORS, and mobile device access require real testing. A phone's loopback is not a desktop's loopback.

Browsers differ here. From the https site, Safari (and every iOS browser, all WebKit) blocks requests to http://127.0.0.1 as mixed content, so local Ollama works only in Chromium browsers and Firefox. Chrome first asks for local network access, and a declined prompt blocks the request. The connection guide detects both cases instead of reporting that Ollama is off. Checked in Safari 26.3.1 and Chrome 156 on macOS (October 2026).

## Phases

1. Foundation/provider connections: model catalogs, PKCE, BYOK, streaming smoke test.
2. Rooms and orchestration: roles, shared transcript, interruption, four modes.
3. Memory/cost controls: saved room history, search, reservation ledger, safety limits.
4. Export/sharing/PWA: Markdown/PDF, read-only snapshots, installable offline shell.
5. Verified Memory: signed packs checked in the browser, labelled proposals, export for offline signing (docs/verified-memory.md).
6. External agents (Eureka): agents on this computer join rooms over a signed handshake, with per-member grants (docs/external-agents.md).

Each phase must retain a working standalone checkout. Review target: python1/knights-circle, main. Never merge, deploy, publish, or release from this workflow.

## License

Knights Circle is © 2026 Paul Charydczak, licensed under the [GNU AGPL v3.0 only](LICENSE) (`AGPL-3.0-only`); the third-party files below keep their own licenses.

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

## Preview hosting

Paul connects the repository to Vercel. `npm run build` copies only allowlisted app assets to `dist/`. Security headers are defined in `vercel.json`. Live testing awaits Paul’s preview URLs. No deployment is performed by this workflow.
