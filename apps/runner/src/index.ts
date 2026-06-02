import crypto from 'node:crypto'
import express from 'express'
import type { RunnerEvent, RunId } from '@opviz/shared'
import { getExecutionSpec } from '@opviz/shared'
import { SseHub } from './sse.js'
import { runOpenPaymentsFlow, type RunnerConfig } from './openPaymentsFlow.js'

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
  const body = req.body as Partial<RunnerConfig> | undefined

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
  res.status(202).json({ runId })

  const spec = getExecutionSpec(config.scenarioId)
  void runOpenPaymentsFlow(runId, config, spec, emit, waitIfPaused)
})

app.post('/pause', (_req, res) => {
  paused = true
  const runId: RunId = crypto.randomUUID()
  emit({ id: crypto.randomUUID(), runId, ts: nowIso(), type: 'run.paused', level: 'info' })
  res.status(204).end()
})

app.post('/resume', (_req, res) => {
  paused = false
  const runId: RunId = crypto.randomUUID()
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

