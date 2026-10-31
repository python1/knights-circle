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

Inference and catalog requests go directly to fixed provider origins, with keys in headers, no cookies, and redirects rejected. There is no telemetry, remote font, CDN script, or request logging. Provider response error bodies are not displayed or logged. Browser developer tools and extensions may still observe requests. Any script compromise of the app origin can expose in-memory keys. Users must supply their own credentials; never embed a developer/shared key.

This client-side BYOK design requires security review before public release. OpenAI recommends keeping secrets on servers. A relay would receive the user's credential, conflicting with the strict requirement that it only be sent to the provider; no relay is implemented.

Ollama targets only http://127.0.0.1:11434, requires an installed/running local instance and origin configuration. HTTPS public pages, browser local-network permissions, CORS, and mobile device access require real testing. A phone's loopback is not a desktop's loopback.

## Phases

1. Foundation/provider connections: model catalogs, PKCE, BYOK, streaming smoke test.
2. Rooms and orchestration: roles, shared transcript, interruption, four modes.
3. Memory/cost controls: saved room history, search, reservation ledger, safety limits.
4. Export/sharing/PWA: Markdown/PDF, read-only snapshots, installable offline shell.

Each phase must retain a working standalone checkout. PRs await repository selection and valid GitHub authentication. Never merge, deploy, publish, or release from this workflow.

## License credits

No third-party runtime packages, copied assets, fonts, or SDK source are included. Provider names appear only to identify integrations and do not form the product name. License/NOTICE files of any future dependencies must be retained. This repository has no distribution license selected yet; Paul must choose one before release.

## Official integration references

- https://openrouter.ai/docs/guides/overview/auth/oauth
- https://developers.openai.com/api/reference/overview
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://platform.claude.com/docs/en/api/messages
- https://ai.google.dev/api/generate-content
- https://docs.x.ai/developers/rest-api-reference
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/faq

## Vercel preview preparation

Paul connects this repository to Vercel. `npm run build` produces only allowlisted public assets in `dist/`; `vercel.json` supplies security headers. No deployment action is performed by this workflow. Live acceptance testing waits for Paul’s preview URL.
