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
// Derives the two wallet currencies and the quote's debit/receive amounts for a mock run. Since
// the mock has no real quote, the variable (converted) side is an illustrative FX estimate built
// from spec.display; `approxSide` marks it so the timeline can render it with a "≈".
function mockAmounts(spec: FlowExecutionSpec) {
  const fixedSend = spec.amountMode === 'fixed-send'
  const fixed = (fixedSend ? spec.debitAmount : spec.incomingAmount)!

  // Without display hints both sides share the fixed currency and nothing is approximate.
  const cpAsset = spec.display?.counterpartyAsset ?? { assetCode: fixed.assetCode, assetScale: fixed.assetScale }
  const fxRate = spec.display?.fxRate ?? 1
  const fixedMajor = Number(fixed.value) / 10 ** fixed.assetScale
  const counterparty = {
    assetCode: cpAsset.assetCode,
    assetScale: cpAsset.assetScale,
    value: Math.round(fixedMajor * fxRate * 10 ** cpAsset.assetScale).toString(),
  }

  // For fixed-send the sender's debit is the fixed side and the receiver's amount is derived;
  // for fixed-receive it's the reverse.
  const debitAmount = fixedSend ? fixed : counterparty
  const receiveAmount = fixedSend ? counterparty : fixed
  const approxSide: 'debit' | 'receive' | undefined = spec.display
    ? fixedSend
      ? 'receive'
      : 'debit'
    : undefined

  return {
    senderAsset: debitAmount,
    receiverAsset: receiveAmount,
    debitAmount,
    receiveAmount,
    approxSide,
  }
}

export function makeMockRunEvents(spec: FlowExecutionSpec, consentUrl: string): RunnerEvent[] {
  if (spec.recipients?.length) return makeSplitRunEvents(spec, consentUrl)

  const { steps } = spec
  const { senderAsset, receiverAsset, debitAmount, receiveAmount, approxSide } = mockAmounts(spec)
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
      assetCode: senderAsset.assetCode,
      assetScale: senderAsset.assetScale,
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
      assetCode: receiverAsset.assetCode,
      assetScale: receiverAsset.assetScale,
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
      debitAmount,
      receiveAmount,
      approxSide,
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
  // Split scenarios are always fixed-receive with a top-level incomingAmount (the customer total).
  const { steps, recipients = [] } = spec
  const incomingAmount = spec.incomingAmount!
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
