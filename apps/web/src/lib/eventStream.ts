import type { RunnerEvent } from '@opviz/shared'

export type RunnerConfig = {
  keyId: string
  privateKeyPath: string
  clientWalletAddressUrl: string
  sendingWalletAddressUrl: string
  receivingWalletAddressUrl: string
  callbackPort?: number
  scenarioId?: string
  uiBaseUrl?: string
}

export type StreamStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type StreamCallbacks = {
  onEvent: (e: RunnerEvent) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export type EventStreamClient = {
  connect: (callbacks: StreamCallbacks) => void
  disconnect: () => void
  startRun: (config: RunnerConfig) => Promise<{ runId?: string }>
  pause: () => Promise<void>
  resume: () => Promise<void>
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

export function createRunnerClient(baseUrl: string): EventStreamClient {
  let es: EventSource | undefined

  function disconnect() {
    es?.close()
    es = undefined
  }

  function connect(callbacks: StreamCallbacks) {
    disconnect()

    const url = joinUrl(baseUrl, '/events')
    es = new EventSource(url)

    es.onopen = () => callbacks.onConnected?.()
    es.onerror = () => callbacks.onDisconnected?.()

    const listen = (type: string, isRunnerControl = false) => {
      es?.addEventListener(type, (msg) => {
        if (isRunnerControl) {
          callbacks.onConnected?.()
          return
        }
        try {
          callbacks.onConnected?.()
          callbacks.onEvent(JSON.parse((msg as MessageEvent).data) as RunnerEvent)
        } catch {
          // ignore malformed
        }
      })
    }

    // Runner uses named SSE events (`event: <type>`). We must subscribe per-type.
    listen('runner.ready', true)
    listen('runner.ping', true)
    for (const t of [
      'run.started',
      'run.completed',
      'run.paused',
      'run.resumed',
      'walletAddress.resolved',
      'grant.requested',
      'grant.finalized',
      'grant.interactive_required',
      'grant.continued',
      'incomingPayment.created',
      'quote.created',
      'outgoingPayment.created',
      'runner.log',
      'runner.error',
    ]) {
      listen(t)
    }
  }

  async function startRun(config: RunnerConfig) {
    const res = await fetch(joinUrl(baseUrl, '/run'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(body || `Runner rejected run (${res.status})`)
    }
    return (await res.json()) as { runId?: string }
  }

  async function pause() {
    await fetch(joinUrl(baseUrl, '/pause'), { method: 'POST' })
  }

  async function resume() {
    await fetch(joinUrl(baseUrl, '/resume'), { method: 'POST' })
  }

  return { connect, disconnect, startRun, pause, resume }
}

