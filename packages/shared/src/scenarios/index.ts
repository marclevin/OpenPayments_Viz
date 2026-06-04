import type { FlowDefinition, FlowExecutionSpec } from '../types.js'
import { p2pExampleFlow } from './p2pExampleFlow.js'
import { subscriptionFixedFlow, subscriptionFixedSpec } from './subscriptionFixedFlow.js'

export * from './p2pExampleFlow.js'
export * from './subscriptionFixedFlow.js'

// Registry of all selectable scenarios. Adding a new teaching scenario is purely
// data: author a FlowDefinition (with node/edge/step descriptions and per-step
// nodeRoles) and append it here — no app logic changes required.
export const scenarios: FlowDefinition[] = [p2pExampleFlow, subscriptionFixedFlow]

export const defaultScenarioId = p2pExampleFlow.id

export function getScenarioById(id: string): FlowDefinition | undefined {
  return scenarios.find((s) => s.id === id)
}

// Execution spec for the original P2P one-time payment (canonical sequence, fixed $10 incoming).
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
  incomingAmount: { value: '1000', assetCode: 'USD', assetScale: 2 },
}

// Maps each scenario to the execution spec used by the runner (real) and the web mock.
const executionSpecs: Record<string, FlowExecutionSpec> = {
  [openPaymentsExampleSpec.scenarioId]: openPaymentsExampleSpec,
  [subscriptionFixedSpec.scenarioId]: subscriptionFixedSpec,
}

export function getExecutionSpec(scenarioId: string | undefined): FlowExecutionSpec {
  return (scenarioId && executionSpecs[scenarioId]) || openPaymentsExampleSpec
}
