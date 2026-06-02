import type { Edge, Node } from 'reactflow'
import type { FlowDefinition, StepStatus } from './types.js'

export type FlowNodeData = {
  label: string
  kind: string
  status?: StepStatus
}

export function flowToReactFlow(flow: FlowDefinition, statusesByStepId: Record<string, StepStatus | undefined>): {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
} {
  const nodes: Node<FlowNodeData>[] = flow.nodes.map((n) => ({
    id: n.id,
    type: 'flowNode',
    position: n.position,
    data: { label: n.label, kind: n.kind },
  }))

  const edges: Edge[] = flow.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    label: e.label,
    data: { kind: e.kind, stepId: e.stepId },
    animated: e.kind === 'redirect',
    style:
      e.stepId && statusesByStepId[e.stepId] === 'error'
        ? { stroke: 'var(--danger)', strokeWidth: 2 }
        : e.stepId && statusesByStepId[e.stepId] === 'success'
          ? { stroke: 'var(--ok)', strokeWidth: 2 }
          : undefined,
  }))

  return { nodes, edges }
}

