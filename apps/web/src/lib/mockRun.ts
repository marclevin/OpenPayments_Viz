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
