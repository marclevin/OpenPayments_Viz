import type { FlowDefinition, FlowExecutionSpec } from '../types.js'
import { p2pExampleFlow } from './p2pExampleFlow.js'
import { splitPaymentFlow, splitPaymentSpec } from './splitPaymentFlow.js'
import { subscriptionFixedFlow, subscriptionFixedSpec } from './subscriptionFixedFlow.js'

export * from './p2pExampleFlow.js'
export * from './splitPaymentFlow.js'
export * from './subscriptionFixedFlow.js'

// Registry of all selectable scenarios. Adding a new teaching scenario is purely
// data: author a FlowDefinition (with node/edge/step descriptions and per-step
// nodeRoles) and append it here — no app logic changes required.
export const scenarios: FlowDefinition[] = [p2pExampleFlow, subscriptionFixedFlow, splitPaymentFlow]

export const defaultScenarioId = p2pExampleFlow.id

export function getScenarioById(id: string): FlowDefinition | undefined {
  return scenarios.find((s) => s.id === id)
}

// Execution spec for the P2P one-time payment. Fixed-SEND: the sender is debited exactly
// $10.00 USD and the receiver's (EUR) wallet gets whatever that converts to, so the sender
// covers the currency conversion. The display hints drive the web mock's "≈" EUR estimate
// (1 USD ≈ 0.858 EUR); the real runner uses the live wallets and the actual quote.
const openPaymentsExampleSpec: FlowExecutionSpec = {
  scenarioId: p2pExampleFlow.id,
  steps: {
    walletResolve: 'step-wallet-resolve',
    incomingGrant: 'step-grant-incoming',
    incomingPayment: 'step-incoming-payment',
    quoteGrant: 'step-grant-quote',
    quote: 'step-quote',
    outgoingGrantInteractive: 'step-grant-outgoing-interactive',
    outgoingGrantContinue: 'step-grant-outgoing-continue',
    outgoingPayment: 'step-outgoing-payment',
  },
  amountMode: 'fixed-send',
  debitAmount: { value: '1000', assetCode: 'USD', assetScale: 2 },
  display: { counterpartyAsset: { assetCode: 'EUR', assetScale: 2 }, fxRate: 0.858 },
}

// Maps each scenario to the execution spec used by the runner (real) and the web mock.
const executionSpecs: Record<string, FlowExecutionSpec> = {
  [openPaymentsExampleSpec.scenarioId]: openPaymentsExampleSpec,
  [subscriptionFixedSpec.scenarioId]: subscriptionFixedSpec,
  [splitPaymentSpec.scenarioId]: splitPaymentSpec,
}

export function getExecutionSpec(scenarioId: string | undefined): FlowExecutionSpec {
  return (scenarioId && executionSpecs[scenarioId]) || openPaymentsExampleSpec
}
