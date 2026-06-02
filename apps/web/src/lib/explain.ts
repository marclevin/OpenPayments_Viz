import type { FlowDefinition, FlowEdge, FlowNode, FlowStep, StepStatus } from '@opviz/shared'

// A labeled block of explanation. The panel renders `label` as a small section header
// and `body` as color-coded prose.
export type ExplainSegment = { label: string; body: string }

// Aggregate a node's status from every step it participates in (error > active > success > idle).
export function nodeStatus(
  nodeId: string,
  statusesByStepId: Record<string, StepStatus>,
  flow: FlowDefinition
): StepStatus {
  const related = flow.steps.filter((s) => s.involvedNodeIds.includes(nodeId)).map((s) => s.id)
  if (related.some((id) => statusesByStepId[id] === 'error')) return 'error'
  if (related.some((id) => statusesByStepId[id] === 'active')) return 'active'
  if (related.some((id) => statusesByStepId[id] === 'success')) return 'success'
  return 'idle'
}

function nodeStatusSentence(label: string, status: StepStatus): string {
  switch (status) {
    case 'active':
      return `${label} is active right now.`
    case 'success':
      return `${label} has completed its part successfully.`
    case 'error':
      return `${label} ran into an error — check the event log.`
    default:
      return `${label} hasn’t been involved yet.`
  }
}

// Explanation of a component: WHAT it is + HOW it's used at the selected timeline step + status.
export function explainNode(
  node: FlowNode,
  step: FlowStep | undefined,
  status: StepStatus
): ExplainSegment[] {
  const out: ExplainSegment[] = []
  if (node.description) out.push({ label: 'What it is', body: node.description })

  if (step) {
    if (step.involvedNodeIds.includes(node.id)) {
      const role = step.nodeRoles?.[node.id] ?? `The ${node.label} takes part in this step.`
      out.push({ label: `At this step · ${step.title}`, body: role })
    } else {
      out.push({
        label: `At this step · ${step.title}`,
        body: `The ${node.label} isn’t involved in this step — it’s used in other steps.`,
      })
    }
  }

  out.push({ label: 'Status', body: nodeStatusSentence(node.label, status) })
  return out
}

function edgeStatusSentence(status: StepStatus | undefined): string {
  switch (status) {
    case 'active':
      return 'This request is in progress.'
    case 'success':
      return 'This request completed successfully.'
    case 'error':
      return 'This request failed — check the event log.'
    default:
      return 'This request hasn’t been sent yet.'
  }
}

export function explainEdge(edge: FlowEdge, edgeStatus: StepStatus | undefined): ExplainSegment[] {
  const out: ExplainSegment[] = []
  if (edge.description) out.push({ label: 'What it is', body: edge.description })
  if (edge.kind === 'relation' || !edge.stepId) {
    out.push({
      label: 'Relationship',
      body: 'This is a structural relationship, not a network request, so it has no live status.',
    })
  } else {
    out.push({ label: 'Status', body: edgeStatusSentence(edgeStatus) })
  }
  return out
}

function stepStatusSentence(status: StepStatus | undefined): string {
  switch (status) {
    case 'active':
      return 'This step is currently in progress.'
    case 'success':
      return 'This step has completed successfully.'
    case 'error':
      return 'This step has failed — check the event log for details.'
    default:
      return 'This step hasn’t run yet.'
  }
}

export function explainStep(
  step: FlowStep,
  status: StepStatus | undefined,
  consentNeeded: boolean
): ExplainSegment[] {
  const out: ExplainSegment[] = []
  if (step.description) out.push({ label: 'What happens', body: step.description })
  if (step.kind === 'grant.interactive_required' && consentNeeded) {
    out.push({
      label: 'Consent',
      body: 'This step needs your consent: open the consent link, approve, and the run continues automatically.',
    })
  }
  out.push({ label: 'Status', body: stepStatusSentence(status) })
  return out
}
