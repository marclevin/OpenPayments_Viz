import type { FlowDefinition, FlowExecutionSpec } from '../types.js'
import { p2pExampleFlow } from './p2pExampleFlow.js'

// Teaching failure scenarios. They reuse the canonical P2P graph but inject a failure at a chosen
// step via the spec's `mockFailure`, so the timeline turns that step red with an explanatory error.
// These are Mocked-mode only: real TestNet failures are hard to trigger reliably and on demand.

// The P2P step ids (shared with p2pExampleFlow), so each failure spec maps the standard sequence.
const p2pSteps = {
  walletResolve: 'step-wallet-resolve',
  incomingGrant: 'step-grant-incoming',
  incomingPayment: 'step-incoming-payment',
  quoteGrant: 'step-grant-quote',
  quote: 'step-quote',
  outgoingGrantInteractive: 'step-grant-outgoing-interactive',
  outgoingGrantContinue: 'step-grant-outgoing-continue',
  outgoingPayment: 'step-outgoing-payment',
} as const

function failureFlow(id: string, title: string, description: string): FlowDefinition {
  return {
    ...p2pExampleFlow,
    id,
    title,
    description,
    mockOnly: true,
    mockOnlyReason: 'A teaching failure scenario, available in Mocked mode only.',
  }
}

// A fixed-send base (mirrors the P2P example) shared by the single-payment failure specs.
const fixedSendBase = {
  amountMode: 'fixed-send' as const,
  debitAmount: { value: '1000', assetCode: 'USD', assetScale: 2 },
  display: { counterpartyAsset: { assetCode: 'EUR', assetScale: 2 }, fxRate: 0.858 },
}

type FailureScenario = { flow: FlowDefinition; spec: FlowExecutionSpec }

export const failureScenarios: FailureScenario[] = [
  {
    flow: failureFlow(
      'fail-incompatible-assets',
      'Failure: incompatible assets',
      'The Client asks for a Quote, but there is no exchange-rate path between the sender’s and receiver’s currencies, so the Resource Server can’t price the transfer. The run fails at the Quote step.'
    ),
    spec: {
      scenarioId: 'fail-incompatible-assets',
      steps: p2pSteps,
      ...fixedSendBase,
      mockFailure: {
        atStep: 'step-quote',
        message: 'Quote failed: no exchange-rate provider connects the sender and receiver assets, so the transfer can’t be priced.',
      },
    },
  },
  {
    flow: failureFlow(
      'fail-consent-denied',
      'Failure: consent denied',
      'Everything is set up and the Client asks the sender to approve the payment, but the sender declines (or the consent window times out). Without approval the grant cannot be continued, so no outgoing payment is created.'
    ),
    spec: {
      scenarioId: 'fail-consent-denied',
      steps: p2pSteps,
      ...fixedSendBase,
      mockFailure: {
        atStep: 'step-grant-outgoing-continue',
        message: 'Grant continuation failed: the sender declined consent (or it expired), so the outgoing-payment grant was never finalized.',
      },
    },
  },
  {
    flow: failureFlow(
      'fail-grant-limit',
      'Failure: grant limit too low',
      'The sender consents, but the outgoing-payment grant’s debit limit is lower than the quoted debit amount, so the account-servicing entity refuses to create the payment. The run fails at the Outgoing Payment step.'
    ),
    spec: {
      scenarioId: 'fail-grant-limit',
      steps: p2pSteps,
      ...fixedSendBase,
      mockFailure: {
        atStep: 'step-outgoing-payment',
        message: 'Outgoing payment rejected: the quoted debitAmount exceeds the grant’s authorized debit limit.',
      },
    },
  },
]
