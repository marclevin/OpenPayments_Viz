import type { RunnerEvent } from '@opviz/shared'

function nowIso() {
  return new Date().toISOString()
}

const RUN_ID = 'mock'

// Fully-typed mock trace mirroring the runner's event shapes, with realistic live
// data so the narration's "live values" render without a real run.
export function makeMockRunEvents(consentUrl: string): RunnerEvent[] {
  return [
    { id: 'e1', runId: RUN_ID, ts: nowIso(), type: 'run.started', level: 'info' },
    {
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: 'step-wallet-resolve',
      level: 'info',
      wallet: 'sending',
      walletAddressUrl: 'https://ilp.interledger-test.dev/usdtest',
      authServer: 'https://auth.interledger-test.dev',
      resourceServer: 'https://ilp.interledger-test.dev',
      id: 'https://ilp.interledger-test.dev/usdtest',
      assetCode: 'USD',
      assetScale: 2,
    },
    {
      runId: RUN_ID,
      ts: nowIso(),
      type: 'walletAddress.resolved',
      stepId: 'step-wallet-resolve',
      level: 'info',
      wallet: 'receiving',
      walletAddressUrl: 'https://ilp.interledger-test.dev/a23bbe02',
      authServer: 'https://auth.interledger-test.dev',
      resourceServer: 'https://ilp.interledger-test.dev',
      id: 'https://ilp.interledger-test.dev/a23bbe02',
      assetCode: 'USD',
      assetScale: 2,
    },
    {
      id: 'e3',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.requested',
      stepId: 'step-grant-incoming',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
      access: [{ type: 'incoming-payment', actions: ['read', 'complete', 'create'] }],
    },
    {
      id: 'e3b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.finalized',
      stepId: 'step-grant-incoming',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
    },
    {
      runId: RUN_ID,
      ts: nowIso(),
      type: 'incomingPayment.created',
      stepId: 'step-incoming-payment',
      level: 'info',
      id: 'https://ilp.interledger-test.dev/incoming-payments/ip_123',
    },
    {
      id: 'e5',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.requested',
      stepId: 'step-grant-quote',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
      access: [{ type: 'quote', actions: ['create', 'read'] }],
    },
    {
      id: 'e5b',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.finalized',
      stepId: 'step-grant-quote',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
    },
    {
      runId: RUN_ID,
      ts: nowIso(),
      type: 'quote.created',
      stepId: 'step-quote',
      level: 'info',
      id: 'https://ilp.interledger-test.dev/quotes/q_123',
      debitAmount: { assetCode: 'USD', assetScale: 2, value: '1000' },
    },
    {
      id: 'e7',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.interactive_required',
      stepId: 'step-grant-outgoing-interactive',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
      redirectUrl: consentUrl,
      callbackUrl: 'http://localhost:3999/callback',
    },
  ]
}

export function makeMockConsentCompletionEvents(): RunnerEvent[] {
  return [
    {
      id: 'e8',
      runId: RUN_ID,
      ts: nowIso(),
      type: 'grant.continued',
      stepId: 'step-grant-outgoing-continue',
      level: 'info',
      authServer: 'https://auth.interledger-test.dev',
    },
    {
      runId: RUN_ID,
      ts: nowIso(),
      type: 'outgoingPayment.created',
      stepId: 'step-outgoing-payment',
      level: 'info',
      id: 'https://ilp.interledger-test.dev/outgoing-payments/op_123',
    },
    { id: 'e10', runId: RUN_ID, ts: nowIso(), type: 'run.completed', level: 'info' },
  ]
}
