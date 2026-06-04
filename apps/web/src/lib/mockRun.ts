import type { FlowExecutionSpec, RunnerEvent } from '@opviz/shared'

function nowIso() {
  return new Date().toISOString()
}

const RUN_ID = 'mock'
const AUTH = 'https://auth.interledger-test.dev'
const RESOURCE = 'https://ilp.interledger-test.dev'

// Fully-typed mock trace driven by a scenario's execution spec, with realistic live data so
// the timeline/graph animate identically to a real run. Uses the spec's step ids and amount,
// so any scenario sharing the canonical Open Payments sequence works without bespoke mock code.
export function makeMockRunEvents(spec: FlowExecutionSpec, consentUrl: string): RunnerEvent[] {
  if (spec.recipients?.length) return makeSplitRunEvents(spec, consentUrl)

  const { steps, incomingAmount } = spec
  return [
    { id: 'e1', runId: RUN_ID, ts: nowIso(), type: 'run.started', level: 'info' },
    {
      id: 'e2a',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: steps.walletResolve,
      level: 'info',
      wallet: 'sending',
      walletAddressUrl: `${RESOURCE}/sending-wallet`,
      authServer: AUTH,
      resourceServer: RESOURCE,
      resourceId: `${RESOURCE}/sending-wallet`,
      assetCode: incomingAmount.assetCode,
      assetScale: incomingAmount.assetScale,
    },
    {
      id: 'e2b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: steps.walletResolve,
      level: 'info',
      wallet: 'receiving',
      walletAddressUrl: `${RESOURCE}/receiving-wallet`,
      authServer: AUTH,
      resourceServer: RESOURCE,
      resourceId: `${RESOURCE}/receiving-wallet`,
      assetCode: incomingAmount.assetCode,
      assetScale: incomingAmount.assetScale,
    },
    {
      id: 'e3',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.requested',
      stepId: steps.incomingGrant,
      level: 'info',
      authServer: AUTH,
      access: [{ type: 'incoming-payment', actions: ['read', 'complete', 'create'] }],
    },
    {
      id: 'e3b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.finalized',
      stepId: steps.incomingGrant,
      level: 'info',
      authServer: AUTH,
    },
    {
      id: 'e4',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'incomingPayment.created',
      stepId: steps.incomingPayment,
      level: 'info',
      resourceId: `${RESOURCE}/incoming-payments/ip_123`,
    },
    {
      id: 'e5',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.requested',
      stepId: steps.quoteGrant,
      level: 'info',
      authServer: AUTH,
      access: [{ type: 'quote', actions: ['create', 'read'] }],
    },
    {
      id: 'e5b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.finalized',
      stepId: steps.quoteGrant,
      level: 'info',
      authServer: AUTH,
    },
    {
      id: 'e6',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'quote.created',
      stepId: steps.quote,
      level: 'info',
      resourceId: `${RESOURCE}/quotes/q_123`,
      debitAmount: { assetCode: incomingAmount.assetCode, assetScale: incomingAmount.assetScale, value: incomingAmount.value },
    },
    {
      id: 'e7',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.interactive_required',
      stepId: steps.outgoingGrantInteractive,
      level: 'info',
      authServer: AUTH,
      redirectUrl: consentUrl,
      callbackUrl: 'http://localhost:3999/callback',
    },
  ]
}

export function makeMockConsentCompletionEvents(spec: FlowExecutionSpec): RunnerEvent[] {
  if (spec.recipients?.length) return makeSplitConsentCompletionEvents(spec)

  const { steps } = spec
  const events: RunnerEvent[] = [
    {
      id: 'e8',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.continued',
      stepId: steps.outgoingGrantContinue,
      level: 'info',
      authServer: AUTH,
    },
    {
      id: 'e9',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'outgoingPayment.created',
      stepId: steps.outgoingPayment,
      level: 'info',
      resourceId: `${RESOURCE}/outgoing-payments/op_123`,
    },
  ]
  // Recurring scenarios: light up the informational explainer step at the end.
  if (steps.recurring) {
    events.push({
      id: 'e9b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'runner.log',
      stepId: steps.recurring,
      level: 'info',
      message: 'Recurring authorization active: the remaining payments are pre-approved on this grant.',
    })
  }
  events.push({ id: 'e10', runId: RUN_ID, ts: nowIso(), type: 'run.completed', level: 'info' })
  return events
}

// Split-payment trace: one customer payment fans out to multiple recipients. Each recipient gets
// its own incoming-payment grant + creation and its own quote (off a single shared quote grant);
// then a single combined interactive grant gates the per-recipient outgoing payments (emitted by
// makeSplitConsentCompletionEvents after consent). Event ids are suffixed with the recipient key
// so the dedupe-by-id in App.appendEvent never drops a second branch's events.
function makeSplitRunEvents(spec: FlowExecutionSpec, consentUrl: string): RunnerEvent[] {
  const { steps, incomingAmount, recipients = [] } = spec
  const events: RunnerEvent[] = [
    { id: 'sp-start', runId: RUN_ID, ts: nowIso(), type: 'run.started', level: 'info' },
    {
      id: 'sp-wa-customer',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: steps.walletResolve,
      level: 'info',
      wallet: 'sending',
      walletAddressUrl: `${RESOURCE}/customer-wallet`,
      authServer: AUTH,
      resourceServer: RESOURCE,
      resourceId: `${RESOURCE}/customer-wallet`,
      assetCode: incomingAmount.assetCode,
      assetScale: incomingAmount.assetScale,
    },
  ]

  // One wallet.resolved per recipient (both on the receiving side).
  for (const r of recipients) {
    events.push({
      id: `sp-wa-${r.key}`,
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: steps.walletResolve,
      level: 'info',
      wallet: 'receiving',
      walletAddressUrl: `${RESOURCE}/${r.key}-wallet`,
      authServer: AUTH,
      resourceServer: RESOURCE,
      resourceId: `${RESOURCE}/${r.key}-wallet`,
      assetCode: r.incomingAmount.assetCode,
      assetScale: r.incomingAmount.assetScale,
    })
  }

  // Per-recipient incoming-payment grant + creation.
  for (const r of recipients) {
    events.push(
      {
        id: `sp-grant-in-${r.key}`,
        runId: RUN_ID,
        ts: nowIso(),
        type: 'grant.requested',
        stepId: r.steps.incomingGrant,
        level: 'info',
        authServer: AUTH,
        access: [{ type: 'incoming-payment', actions: ['read', 'complete', 'create'] }],
      },
      {
        id: `sp-grantfin-in-${r.key}`,
        runId: RUN_ID,
        ts: nowIso(),
        type: 'grant.finalized',
        stepId: r.steps.incomingGrant,
        level: 'info',
        authServer: AUTH,
      },
      {
        id: `sp-ip-${r.key}`,
        runId: RUN_ID,
        ts: nowIso(),
        type: 'incomingPayment.created',
        stepId: r.steps.incomingPayment,
        level: 'info',
        resourceId: `${RESOURCE}/incoming-payments/ip_${r.key}`,
      }
    )
  }

  // Single quote grant (shared), then one quote per recipient.
  events.push(
    {
      id: 'sp-grant-quote',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.requested',
      stepId: steps.quoteGrant,
      level: 'info',
      authServer: AUTH,
      access: [{ type: 'quote', actions: ['create', 'read'] }],
    },
    {
      id: 'sp-grantfin-quote',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.finalized',
      stepId: steps.quoteGrant,
      level: 'info',
      authServer: AUTH,
    }
  )
  for (const r of recipients) {
    events.push({
      id: `sp-quote-${r.key}`,
      runId: RUN_ID,
      ts: nowIso(),
      type: 'quote.created',
      stepId: r.steps.quote,
      level: 'info',
      resourceId: `${RESOURCE}/quotes/q_${r.key}`,
      debitAmount: {
        assetCode: r.incomingAmount.assetCode,
        assetScale: r.incomingAmount.assetScale,
        value: r.incomingAmount.value,
      },
    })
  }

  // Single combined interactive outgoing grant (limit = full customer total) → consent redirect.
  events.push({
    id: 'sp-grant-out',
    runId: RUN_ID,
    ts: nowIso(),
    type: 'grant.interactive_required',
    stepId: steps.outgoingGrantInteractive,
    level: 'info',
    authServer: AUTH,
    redirectUrl: consentUrl,
    callbackUrl: 'http://localhost:3999/callback',
  })

  return events
}

function makeSplitConsentCompletionEvents(spec: FlowExecutionSpec): RunnerEvent[] {
  const { steps, recipients = [] } = spec
  const events: RunnerEvent[] = [
    {
      id: 'sp-continued',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.continued',
      stepId: steps.outgoingGrantContinue,
      level: 'info',
      authServer: AUTH,
    },
  ]
  // One outgoing payment per recipient, off the single consented grant.
  for (const r of recipients) {
    events.push({
      id: `sp-op-${r.key}`,
      runId: RUN_ID,
      ts: nowIso(),
      type: 'outgoingPayment.created',
      stepId: r.steps.outgoingPayment,
      level: 'info',
      resourceId: `${RESOURCE}/outgoing-payments/op_${r.key}`,
    })
  }
  events.push({ id: 'sp-completed', runId: RUN_ID, ts: nowIso(), type: 'run.completed', level: 'info' })
  return events
}
