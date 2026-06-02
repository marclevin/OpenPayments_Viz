import crypto from 'node:crypto'
import {
  createAuthenticatedClient,
  isPendingGrant
} from '@interledger/open-payments'
import type { RequestHandler } from 'express'
import express from 'express'
import type {
  FlowExecutionSpec,
  RunnerEvent,
  RunId,
  StepId
} from '@opviz/shared'

export type RunnerConfig = {
  clientWalletAddressUrl: string
  sendingWalletAddressUrl: string
  receivingWalletAddressUrl: string
  keyId: string
  privateKeyPath: string
  callbackPort?: number
  uiBaseUrl?: string
  scenarioId?: string
}

type Emit = (evt: RunnerEvent) => void
export type WaitIfPaused = () => Promise<void>

function isFinalizedGrantLike(grant: unknown): grant is { access_token: { value: string } } {
  const g = grant as any
  return Boolean(g?.access_token?.value && typeof g.access_token.value === 'string' && !isPendingGrant(g))
}

// Build a valid recurring interval from a spec template (e.g. "R12/<start>/P1M") by replacing
// its start segment with the current time, so the testnet auth server accepts it.
function buildInterval(template: string): string {
  const parts = template.split('/')
  if (parts.length === 3) {
    parts[1] = nowIso()
    return parts.join('/')
  }
  return template
}

function nowIso() {
  return new Date().toISOString()
}

// Generic in the event type so the literal (e.g. 'grant.finalized') is preserved on the
// returned object. Without this, `type` widens to the full union and the spread result no
// longer matches the discriminated RunnerEvent union at the emit() call sites.
function newEventBase<T extends RunnerEvent['type']>(runId: RunId, type: T, stepId?: StepId) {
  return {
    id: crypto.randomUUID(),
    runId,
    ts: nowIso(),
    type,
    stepId,
    level: 'info' as const
  }
}

function buildUiConsentRedirectUrl(uiBaseUrl: string, runId: RunId) {
  const url = new URL(uiBaseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid uiBaseUrl protocol: ${url.protocol}`)
  }

  url.searchParams.set('runId', runId)
  url.searchParams.set('consent', 'ok')
  return url.toString()
}

// How long the runner waits for the user to complete the interactive consent before giving
// up. Without a bound, an abandoned consent leaves the run hanging forever and keeps the
// callback port bound (so the next run hits EADDRINUSE). Overridable via env for slow setups.
const CONSENT_TIMEOUT_MS = Number(process.env.CONSENT_TIMEOUT_MS ?? 180000)

async function waitForInteractRef(
  runId: RunId,
  callbackPort: number,
  uiBaseUrl: string,
  onInteractRef: (ref: string) => void
) {
  return new Promise<string>((resolve, reject) => {
    let server: ReturnType<typeof app.listen> | undefined
    const app = express()
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // Close the callback server and clear the timeout exactly once, on every exit path,
    // so the port is always released.
    function cleanup() {
      if (timer) clearTimeout(timer)
      timer = undefined
      server?.close()
      server = undefined
    }

    function settleResolve(ref: string) {
      if (settled) return
      settled = true
      cleanup()
      resolve(ref)
    }

    function settleReject(err: unknown) {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    timer = setTimeout(() => {
      settleReject(
        new Error(
          `Consent timed out after ${Math.round(
            CONSENT_TIMEOUT_MS / 1000
          )}s. Open the consent link and approve, then run again.`
        )
      )
    }, CONSENT_TIMEOUT_MS)

    const handler: RequestHandler = (req, res) => {
      const interactRefRaw = req.query['interact_ref']
      const interactRef: string | undefined =
        typeof interactRefRaw === 'string'
          ? interactRefRaw
          : Array.isArray(interactRefRaw) && typeof interactRefRaw[0] === 'string'
            ? interactRefRaw[0]
            : undefined

      if (!interactRef) {
        res.status(400).type('text/plain').send('Missing interact_ref in callback query')
        settleReject(new Error('Missing interact_ref in callback query'))
        return
      }

      // Important: do NOT include secrets (interact_ref, tokens, etc.) in the redirect URL.
      let redirectTo: string
      try {
        redirectTo = buildUiConsentRedirectUrl(uiBaseUrl, runId)
      } catch (err) {
        res.status(500).type('text/plain').send('Unable to build UI redirect URL')
        settleReject(err)
        return
      }

      res.redirect(302, redirectTo)
      onInteractRef(interactRef)
      // Resolve after the response has flushed so the browser still gets its redirect even
      // though we immediately close the server.
      res.on('finish', () => settleResolve(interactRef))
    }

    app.get('/', handler)
    app.get('/callback', handler)

    server = app.listen(callbackPort).on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        settleReject(new Error(`Callback port ${callbackPort} is already in use`))
        return
      }
      settleReject(err)
    })
  })
}

function toRunnerError(runId: RunId, stepId: StepId | undefined, err: unknown): RunnerEvent {
  const base = newEventBase(runId, 'runner.error', stepId)
  const e = err as any
  return {
    ...base,
    level: 'error',
    message: e?.message ? String(e.message) : 'Unknown error',
    error: {
      name: e?.name ? String(e.name) : undefined,
      message: e?.message ? String(e.message) : undefined,
      stack: e?.stack ? String(e.stack) : undefined,
      code: e?.code ? String(e.code) : undefined
    }
  }
}

export async function runOpenPaymentsFlow(
  runId: RunId,
  config: RunnerConfig,
  spec: FlowExecutionSpec,
  emit: Emit,
  waitIfPaused: WaitIfPaused = async () => {}
) {
  emit({ ...newEventBase(runId, 'run.started') })

  const callbackPort = config.callbackPort ?? 3999
  const callbackUrl = `http://localhost:${callbackPort}/callback`
  const uiBaseUrl = config.uiBaseUrl ?? process.env.RUNNER_UI_URL ?? 'http://localhost:5173/'

  // Tracks the phase currently in flight so a thrown error is tagged with the step it
  // belongs to — that's what turns the failing step red in the UI timeline/graph.
  let currentStepId: StepId | undefined

  try {
    currentStepId = spec.steps.walletResolve
    const client = await createAuthenticatedClient({
      walletAddressUrl: config.clientWalletAddressUrl,
      keyId: config.keyId,
      privateKey: config.privateKeyPath
    })

    await waitIfPaused()
    const sendingWalletAddress = await client.walletAddress.get({
      url: config.sendingWalletAddressUrl
    })
    emit({
      ...newEventBase(runId, 'walletAddress.resolved', spec.steps.walletResolve),
      wallet: 'sending',
      walletAddressUrl: config.sendingWalletAddressUrl,
      authServer: sendingWalletAddress.authServer,
      resourceServer: sendingWalletAddress.resourceServer,
      resourceId: sendingWalletAddress.id,
      assetCode: sendingWalletAddress.assetCode,
      assetScale: sendingWalletAddress.assetScale
    })

    await waitIfPaused()
    const receivingWalletAddress = await client.walletAddress.get({
      url: config.receivingWalletAddressUrl
    })
    emit({
      ...newEventBase(runId, 'walletAddress.resolved', spec.steps.walletResolve),
      wallet: 'receiving',
      walletAddressUrl: config.receivingWalletAddressUrl,
      authServer: receivingWalletAddress.authServer,
      resourceServer: receivingWalletAddress.resourceServer,
      resourceId: receivingWalletAddress.id,
      assetCode: receivingWalletAddress.assetCode,
      assetScale: receivingWalletAddress.assetScale
    })

    currentStepId = spec.steps.incomingGrant
    emit({
      ...newEventBase(runId, 'grant.requested', spec.steps.incomingGrant),
      authServer: receivingWalletAddress.authServer,
      access: [
        {
          type: 'incoming-payment',
          actions: ['read', 'complete', 'create']
        }
      ]
    })
    const incomingPaymentGrant = await client.grant.request(
      { url: receivingWalletAddress.authServer },
      {
        access_token: {
          access: [
            {
              type: 'incoming-payment',
              actions: ['read', 'complete', 'create']
            }
          ]
        }
      }
    )

    if (!isFinalizedGrantLike(incomingPaymentGrant)) {
      throw new Error('Expected finalized incoming payment grant')
    }
    emit({
      ...newEventBase(runId, 'grant.finalized', spec.steps.incomingGrant),
      authServer: receivingWalletAddress.authServer
    })

    currentStepId = spec.steps.incomingPayment
    await waitIfPaused()
    const incomingPayment = await client.incomingPayment.create(
      {
        url: receivingWalletAddress.resourceServer,
        accessToken: incomingPaymentGrant.access_token.value
      },
      {
        walletAddress: receivingWalletAddress.id,
        incomingAmount: {
          assetCode: receivingWalletAddress.assetCode,
          assetScale: receivingWalletAddress.assetScale,
          value: spec.incomingAmount.value
        },
        metadata: {
          description: 'From OpenPayments flow visualizer runner'
        }
      }
    )
    emit({
      ...newEventBase(runId, 'incomingPayment.created', spec.steps.incomingPayment),
      resourceId: incomingPayment.id
    })

    currentStepId = spec.steps.quoteGrant
    emit({
      ...newEventBase(runId, 'grant.requested', spec.steps.quoteGrant),
      authServer: sendingWalletAddress.authServer,
      access: [
        {
          type: 'quote',
          actions: ['create', 'read']
        }
      ]
    })
    const quoteGrant = await client.grant.request(
      { url: sendingWalletAddress.authServer },
      {
        access_token: {
          access: [
            {
              type: 'quote',
              actions: ['create', 'read']
            }
          ]
        }
      }
    )
    if (!isFinalizedGrantLike(quoteGrant)) {
      throw new Error('Expected finalized quote grant')
    }
    emit({
      ...newEventBase(runId, 'grant.finalized', spec.steps.quoteGrant),
      authServer: sendingWalletAddress.authServer
    })

    currentStepId = spec.steps.quote
    await waitIfPaused()
    const quote = await client.quote.create(
      {
        url: sendingWalletAddress.resourceServer,
        accessToken: quoteGrant.access_token.value
      },
      {
        walletAddress: sendingWalletAddress.id,
        receiver: incomingPayment.id,
        method: 'ilp'
      }
    )
    emit({
      ...newEventBase(runId, 'quote.created', spec.steps.quote),
      resourceId: quote.id,
      debitAmount: quote.debitAmount
    })

    currentStepId = spec.steps.outgoingGrantInteractive
    emit({
      ...newEventBase(runId, 'grant.requested', spec.steps.outgoingGrantInteractive),
      authServer: sendingWalletAddress.authServer,
      access: [
        {
          type: 'outgoing-payment',
          actions: ['read', 'create'],
          identifier: sendingWalletAddress.id
        }
      ]
    })

    const outgoingPaymentGrant = await client.grant.request(
      { url: sendingWalletAddress.authServer },
      {
        access_token: {
          access: [
            {
              type: 'outgoing-payment',
              actions: ['read', 'create'],
              limits: {
                debitAmount: {
                  assetCode: quote.debitAmount.assetCode,
                  assetScale: quote.debitAmount.assetScale,
                  value: quote.debitAmount.value
                },
                // Recurring scenarios authorize repeated payments via an ISO 8601 interval.
                ...(spec.outgoingInterval ? { interval: buildInterval(spec.outgoingInterval) } : {})
              },
              identifier: sendingWalletAddress.id
            }
          ]
        },
        interact: {
          start: ['redirect'],
          finish: {
            method: 'redirect',
            uri: callbackUrl,
            nonce: crypto.randomUUID()
          }
        }
      }
    )

    // Narrow to a pending (interactive) grant so `.interact` and `.continue` are typed — a
    // finalized grant here would mean the auth server didn't require consent, which is a bug.
    if (!isPendingGrant(outgoingPaymentGrant) || !outgoingPaymentGrant.interact?.redirect) {
      throw new Error('Expected outgoing payment grant to include interact.redirect')
    }

    emit({
      ...newEventBase(runId, 'grant.interactive_required', spec.steps.outgoingGrantInteractive),
      authServer: sendingWalletAddress.authServer,
      redirectUrl: outgoingPaymentGrant.interact.redirect,
      callbackUrl
    })

    const interactRef = await waitForInteractRef(runId, callbackPort, uiBaseUrl, (ref) => {
      emit({
        ...newEventBase(runId, 'runner.log', spec.steps.outgoingGrantInteractive),
        message: 'Received interact_ref callback',
        data: { interactRef: ref }
      })
    })

    currentStepId = spec.steps.outgoingGrantContinue
    await waitIfPaused()
    let finalizedOutgoingPaymentGrant
    try {
      finalizedOutgoingPaymentGrant = await client.grant.continue(
        {
          url: outgoingPaymentGrant.continue.uri,
          accessToken: outgoingPaymentGrant.continue.access_token.value
        },
        { interact_ref: interactRef }
      )
    } catch (err) {
      // `@interledger/open-payments` error exports differ across versions/builds.
      // Treat any continuation error as actionable for the user (consent timing).
      const e = err as any
      const msg = e?.message ? String(e.message) : ''
      throw new Error(
        `Error continuing grant (consent likely not completed, expired, or already used). ${msg}`.trim()
      )
    }

    if (!isFinalizedGrantLike(finalizedOutgoingPaymentGrant)) {
      throw new Error('Expected finalized outgoing payment grant after continuation')
    }

    emit({
      ...newEventBase(runId, 'grant.continued', spec.steps.outgoingGrantContinue),
      authServer: sendingWalletAddress.authServer
    })

    currentStepId = spec.steps.outgoingPayment
    await waitIfPaused()
    const outgoingPayment = await client.outgoingPayment.create(
      {
        url: sendingWalletAddress.resourceServer,
        accessToken: finalizedOutgoingPaymentGrant.access_token.value
      },
      {
        walletAddress: sendingWalletAddress.id,
        quoteId: quote.id,
        metadata: {
          description: 'Sent from OpenPayments flow visualizer runner'
        }
      }
    )

    emit({
      ...newEventBase(runId, 'outgoingPayment.created', spec.steps.outgoingPayment),
      resourceId: outgoingPayment.id
    })

    // Recurring scenarios: mark the informational explainer step as done.
    if (spec.steps.recurring) {
      emit({
        ...newEventBase(runId, 'runner.log', spec.steps.recurring),
        message: 'Recurring authorization active: the remaining payments are pre-approved on this grant.'
      })
    }

    emit({ ...newEventBase(runId, 'run.completed') })
  } catch (err) {
    emit(toRunnerError(runId, currentStepId, err))
  }
}

