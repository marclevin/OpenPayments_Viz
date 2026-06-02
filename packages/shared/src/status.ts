import type { RunnerEvent, StepId, StepStatus } from './types.js'

export function getStepStatusFromEvents(stepId: StepId, events: RunnerEvent[]): StepStatus {
  const relevant = events.filter((e) => e.stepId === stepId)
  if (!relevant.length) return 'idle'

  if (relevant.some((e) => e.type === 'runner.error' && e.stepId === stepId)) return 'error'

  // An interactive grant step waits on human consent: it has only "active-ish" events
  // (grant.requested / grant.interactive_required), and the grant.continued that marks
  // consent completion is tagged with the *next* step. So treat this step as success once
  // a grant.continued appears after its interactive_required event.
  const interactiveIdx = events.findIndex(
    (e) => e.stepId === stepId && e.type === 'grant.interactive_required'
  )
  if (interactiveIdx >= 0) {
    const continuedAfter = events.some((e, i) => i > interactiveIdx && e.type === 'grant.continued')
    return continuedAfter ? 'success' : 'active'
  }

  // For now, treat any successful “completion-ish” event as success.
  // This is intentionally simple; we can refine per step kind later.
  const successTypes: RunnerEvent['type'][] = [
    'walletAddress.resolved',
    'grant.finalized',
    'grant.continued',
    'incomingPayment.created',
    'quote.created',
    'outgoingPayment.created',
  ]
  if (relevant.some((e) => (successTypes as string[]).includes(e.type))) return 'success'

  const activeTypes: RunnerEvent['type'][] = ['grant.requested', 'grant.interactive_required', 'runner.log']
  if (relevant.some((e) => (activeTypes as string[]).includes(e.type))) return 'active'

  return 'idle'
}

