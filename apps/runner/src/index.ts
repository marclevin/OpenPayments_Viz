import crypto from 'node:crypto'
import { createUnauthenticatedClient } from '@interledger/open-payments'
import express from 'express'
import type { FlowExecutionSpec, RunnerEvent, RunId } from '@opviz/shared'
import { getExecutionSpec } from '@opviz/shared'
import { SseHub } from './sse.js'
import { runOpenPaymentsFlow, type RunnerConfig } from './openPaymentsFlow.js'

// Payment pointers ($host/path) are shorthand for https URLs; normalize so the OP client accepts them.
function normalizeWalletAddressUrl(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('$')) return `https://${v.slice(1)}`
  return v
}

function isAmount(a: unknown): a is { value: string; assetCode: string; assetScale: number } {
  const x = a as any
  return Boolean(x) && typeof x.value === 'string' && typeof x.assetCode === 'string' && typeof x.assetScale === 'number'
}

// Merge UI-supplied parameter overrides onto a registered spec. Only the fields the runner reads are
// applied, each type-checked; step ids and structure always come from the base spec. The runner uses
// the live wallet's currency, so any assetCode in an amount override is illustrative only.
function applySpecOverrides(base: FlowExecutionSpec, overrides: unknown): FlowExecutionSpec {
  if (!overrides || typeof overrides !== 'object') return base
  const o = overrides as Record<string, unknown>
  const next: FlowExecutionSpec = { ...base }
  if (o.amountMode === 'fixed-send' || o.amountMode === 'fixed-receive') next.amountMode = o.amountMode
  if (isAmount(o.incomingAmount)) next.incomingAmount = o.incomingAmount
  if (isAmount(o.debitAmount)) next.debitAmount = o.debitAmount
  if (typeof o.outgoingInterval === 'string') next.outgoingInterval = o.outgoingInterval
  if (
    Array.isArray(o.recipients) &&
    o.recipients.every((r: any) => r && typeof r.key === 'string' && r.steps && isAmount(r.incomingAmount))
  ) {
    next.recipients = o.recipients as FlowExecutionSpec['recipients']
  }
  return next
}

const app = express()

// Web UI (Vite) runs on a different origin (e.g. :5173). Enable CORS for SSE + POST /run.
const allowedOrigins = new Set(
  (process.env.RUNNER_CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
)

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && (allowedOrigins.has(origin) || allowedOrigins.has('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  } else if (allowedOrigins.has('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
})

app.use(express.json({ limit: '256kb' }))

const port = Number(process.env.PORT ?? 3344)
const sse = new SseHub()
let paused = false
// The run currently in flight. Pause/resume control events are tagged with this so they
// share the run's id instead of inventing an unrelated one.
let activeRunId: RunId | undefined

function nowIso() {
  return new Date().toISOString()
}

function emit(event: RunnerEvent) {
  sse.send(event)
}

async function waitIfPaused() {
  while (paused) {
    await new Promise((r) => setTimeout(r, 200))
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() })
})

// Resolve a wallet address's public details (currency, servers) WITHOUT a key — wallet address
// lookups are unauthenticated. Used by the UI to validate addresses and surface their currency
// before a run (e.g. to warn when a wallet's currency differs from the scenario's assumption).
let unauthClientPromise: ReturnType<typeof createUnauthenticatedClient> | undefined
app.get('/resolve', async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : ''
  const url = normalizeWalletAddressUrl(raw)
  if (!url) {
    res.status(400).json({ error: 'Missing url query parameter' })
    return
  }
  try {
    unauthClientPromise ??= createUnauthenticatedClient({})
    const client = await unauthClientPromise
    const wa = await client.walletAddress.get({ url })
    res.json({
      id: wa.id,
      assetCode: wa.assetCode,
      assetScale: wa.assetScale,
      authServer: wa.authServer,
      resourceServer: wa.resourceServer
    })
  } catch (err) {
    const e = err as any
    res.status(502).json({ error: e?.message ? String(e.message) : 'Could not resolve wallet address' })
  }
})

app.get('/events', (req, res) => {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  res.write(`event: runner.ready\n`)
  res.write(`data: ${JSON.stringify({ ts: nowIso() })}\n\n`)

  sse.addClient(res)

  const keepAlive = setInterval(() => {
    res.write(`event: runner.ping\n`)
    res.write(`data: ${JSON.stringify({ ts: nowIso() })}\n\n`)
  }, 15000)

  req.on('close', () => clearInterval(keepAlive))
})

app.post('/run', (req, res) => {
  const body = req.body as (Partial<RunnerConfig> & { specOverrides?: unknown }) | undefined

  const config: RunnerConfig = {
    clientWalletAddressUrl: String(body?.clientWalletAddressUrl ?? ''),
    sendingWalletAddressUrl: String(body?.sendingWalletAddressUrl ?? ''),
    receivingWalletAddressUrl: String(body?.receivingWalletAddressUrl ?? ''),
    keyId: String(body?.keyId ?? ''),
    privateKeyPath: String(body?.privateKeyPath ?? ''),
    callbackPort: body?.callbackPort ? Number(body.callbackPort) : undefined,
    uiBaseUrl: body?.uiBaseUrl ? String(body.uiBaseUrl) : undefined,
    scenarioId: body?.scenarioId ? String(body.scenarioId) : undefined
  }

  if (
    !config.clientWalletAddressUrl ||
    !config.sendingWalletAddressUrl ||
    !config.receivingWalletAddressUrl ||
    !config.keyId ||
    !config.privateKeyPath
  ) {
    res.status(400).json({
      error:
        'Missing required fields: clientWalletAddressUrl, sendingWalletAddressUrl, receivingWalletAddressUrl, keyId, privateKeyPath'
    })
    return
  }

  const runId: RunId = crypto.randomUUID()
  // A new run always starts un-paused: a leftover pause from a prior run must not block it.
  paused = false
  activeRunId = runId
  res.status(202).json({ runId })

  // The UI may send parameter overrides (amount, mode, interval, split shares) from the scenario
  // editor. Merge them onto the registered spec; step ids and structure stay from the base spec.
  // Currency in any amount override is illustrative — the runner uses the live wallet's asset.
  const baseSpec = getExecutionSpec(config.scenarioId)
  const spec = applySpecOverrides(baseSpec, body?.specOverrides)
  void runOpenPaymentsFlow(runId, config, spec, emit, waitIfPaused)
})

app.post('/pause', (_req, res) => {
  paused = true
  const runId: RunId = activeRunId ?? crypto.randomUUID()
  emit({ id: crypto.randomUUID(), runId, ts: nowIso(), type: 'run.paused', level: 'info' })
  res.status(204).end()
})

app.post('/resume', (_req, res) => {
  paused = false
  const runId: RunId = activeRunId ?? crypto.randomUUID()
  emit({ id: crypto.randomUUID(), runId, ts: nowIso(), type: 'run.resumed', level: 'info' })
  res.status(204).end()
})

app.listen(port, () => {
  // Intentionally avoid logging secrets/config; keep this minimal.
  // eslint-disable-next-line no-console
  console.log(`[runner] listening on http://localhost:${port}`)
  // eslint-disable-next-line no-console
  console.log(`[runner] SSE stream at http://localhost:${port}/events`)
})

