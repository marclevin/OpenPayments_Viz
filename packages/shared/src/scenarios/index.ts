import type { FlowDefinition } from '../types.js'
import { openPaymentsExampleFlow } from './openPaymentsExampleFlow.js'

export * from './openPaymentsExampleFlow.js'

// Registry of all selectable scenarios. Adding a new teaching scenario is purely
// data: author a FlowDefinition (with node/edge/step descriptions and per-step
// nodeRoles) and append it here — no app logic changes required.
export const scenarios: FlowDefinition[] = [openPaymentsExampleFlow]

export const defaultScenarioId = openPaymentsExampleFlow.id

export function getScenarioById(id: string): FlowDefinition | undefined {
  return scenarios.find((s) => s.id === id)
}
