# @opviz/runner

Local Node service that executes the Open Payments flow and streams structured events over **SSE** for the UI.

## Endpoints

- `GET /health`: health check
- `GET /events`: Server-Sent Events stream (connect once, receive all run events)
- `POST /run`: start a run

## Run locally

From repo root:

```bash
npm install
npm run build
npm run dev
```

Runner listens on `http://localhost:3344`.

## CORS (web UI on another port)

The Vite UI typically runs on `http://localhost:5173` while the runner is on `:3344`. CORS is enabled by default for `http://localhost:5173` and `http://127.0.0.1:5173`.

Override with env:

```bash
RUNNER_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## Start a run

Send a `POST` request to `http://localhost:3344/run` with JSON:

```json
{
  "clientWalletAddressUrl": "https://wallet.example.com/alice",
  "sendingWalletAddressUrl": "https://wallet.example.com/alice",
  "receivingWalletAddressUrl": "https://wallet.example.com/bob",
  "keyId": "your-key-id",
  "privateKeyPath": "C:\\\\path\\\\to\\\\USD_KEY.key",
  "callbackPort": 3999,
  "uiBaseUrl": "http://localhost:5173/"
}
```

The response is `202 { "runId": "<uuid>" }`.

## Interactive grant consent

During the run, the runner emits a `grant.interactive_required` event containing:

- `redirectUrl`: open this in the browser to approve consent
- `callbackUrl`: the local callback the auth server redirects to (captures `interact_ref`)

The runner continues the grant automatically after it receives the `interact_ref` callback.

After the callback is received, the local callback server redirects the browser back to the UI using `uiBaseUrl` and includes `runId` in the query string (e.g. `?runId=...&consent=ok`).

## Security notes

- Private keys are **never sent to the browser**.
- The runner reads the private key from the file path you provide, keeps secrets **in memory**, and does not write them back to disk.
- The consent callback redirect does **not** include `interact_ref` or any access tokens in the URL.

