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

function newEventBase(runId: RunId, type: RunnerEvent['type'], stepId?: StepId) {
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

    const handler: RequestHandler = (req, res) => {
      const interactRefRaw = req.query['interact_ref']
      const interactRef =
        typeof interactRefRaw === 'string'
          ? interactRefRaw
          : Array.isArray(interactRefRaw)
            ? interactRefRaw[0]
            : undefined

      if (!interactRef) {
        res.status(400).type('text/plain').send('Missing interact_ref in callback query')
        if (!settled) {
          settled = true
          reject(new Error('Missing interact_ref in callback query'))
        }
        res.on('finish', () => server?.close())
        return
      }

      // Important: do NOT include secrets (interact_ref, tokens, etc.) in the redirect URL.
      let redirectTo: string
      try {
        redirectTo = buildUiConsentRedirectUrl(uiBaseUrl, runId)
      } catch (err) {
        res.status(500).type('text/plain').send('Unable to build UI redirect URL')
        if (!settled) {
          settled = true
          reject(err)
        }
        res.on('finish', () => server?.close())
        return
      }

      res.redirect(302, redirectTo)

      onInteractRef(interactRef)
      if (!settled) {
        settled = true
        resolve(interactRef)
      }
      res.on('finish', () => server?.close())
    }

    app.get('/', handler)
    app.get('/callback', handler)

    server = app.listen(callbackPort).on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        reject(new Error(`Callback port ${callbackPort} is already in use`))
        return
      }
      reject(err)
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

  try {
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
      id: sendingWalletAddress.id,
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
      id: receivingWalletAddress.id,
      assetCode: receivingWalletAddress.assetCode,
      assetScale: receivingWalletAddress.assetScale
    })

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
      id: incomingPayment.id
    })

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
      id: quote.id,
      debitAmount: quote.debitAmount
    })

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

    if (!outgoingPaymentGrant?.interact?.redirect) {
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
      id: outgoingPayment.id
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
    emit(toRunnerError(runId, undefined, err))
  }
}

