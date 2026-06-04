export type FlowId = string
export type NodeId = string
export type EdgeId = string
export type StepId = string

export type FlowNodeKind =
  | 'client'
  | 'walletAddress'
  | 'authServer'
  | 'resourceServer'
  | 'idp'
  | 'grant'
  | 'incomingPayment'
  | 'quote'
  | 'outgoingPayment'
  | 'generic'

export type FlowEdgeKind = 'request' | 'response' | 'redirect' | 'relation' | 'creation'

export type StepKind =
  | 'wallet.resolve'
  | 'grant.request'
  | 'grant.interactive_required'
  | 'grant.continue'
  | 'incomingPayment.create'
  | 'quote.create'
  | 'outgoingPayment.create'
  | 'generic'

export type StepStatus = 'idle' | 'active' | 'success' | 'error' | 'skipped'

export type FlowNode = {
  id: NodeId
  kind: FlowNodeKind
  label: string
  description?: string
  lane?: string
  position: { x: number; y: number }
}

export type FlowEdge = {
  id: EdgeId
  kind: FlowEdgeKind
  source: NodeId
  target: NodeId
  label?: string
  stepId?: StepId
  description?: string
}

export type FlowStep = {
  id: StepId
  kind: StepKind
  title: string
  description?: string
  involvedNodeIds: NodeId[]
  involvedEdgeIds?: EdgeId[]
  // Per-step explanation of how each involved node is used at this stage (keyed by NodeId).
  nodeRoles?: Record<NodeId, string>
  // Optional timeline grouping label; consecutive steps sharing a group render under one header.
  group?: string
}

export type FlowDefinition = {
  id: FlowId
  title: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  steps: FlowStep[]
}

// Maps a scenario's semantic flow stages to its concrete step ids, plus the amounts/interval
// that parameterize the canonical Open Payments call sequence. Used by BOTH the runner (real
// execution) and the web mock so a new scenario plugs in as data, not code.
export type FlowExecutionSpec = {
  scenarioId: FlowId
  steps: {
    walletResolve: StepId
    incomingGrant: StepId
    incomingPayment: StepId
    quoteGrant: StepId
    quote: StepId
    outgoingGrantInteractive: StepId
    outgoingGrantContinue: StepId
    outgoingPayment: StepId
    // Optional informational explainer step (e.g. recurring billing) — no network call.
    recurring?: StepId
  }
  incomingAmount: { value: string; assetCode: string; assetScale: number }
  // ISO 8601 repeating interval for a recurring outgoing-payment grant, e.g. "R12/<start>/P1M".
  outgoingInterval?: string
}

export type RunId = string
export type RunnerEventLevel = 'debug' | 'info' | 'warn' | 'error'

export type RunnerEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.paused'
  | 'run.resumed'
  | 'walletAddress.resolved'
  | 'grant.requested'
  | 'grant.finalized'
  | 'grant.interactive_required'
  | 'grant.continued'
  | 'incomingPayment.created'
  | 'quote.created'
  | 'outgoingPayment.created'
  | 'runner.log'
  | 'runner.error'

export type RunnerEventBase = {
  id: string
  runId: RunId
  ts: string
  type: RunnerEventType
  stepId?: StepId
  level?: RunnerEventLevel
}

export type RunnerEvent =
  | (RunnerEventBase & { type: 'run.started' })
  | (RunnerEventBase & { type: 'run.completed' })
  | (RunnerEventBase & { type: 'run.paused' })
  | (RunnerEventBase & { type: 'run.resumed' })
  | (RunnerEventBase & {
      type: 'runner.log'
      message: string
      data?: unknown
    })
  | (RunnerEventBase & {
      type: 'runner.error'
      message: string
      error?: {
        name?: string
        message?: string
        stack?: string
        code?: string
      }
    })
  | (RunnerEventBase & {
      type: 'walletAddress.resolved'
      wallet: 'sending' | 'receiving' | 'client'
      walletAddressUrl: string
      authServer: string
      resourceServer: string
      // The wallet address's canonical id. Named `resourceId` (not `id`) so it never shadows
      // RunnerEventBase.id, which must stay a unique per-event identifier.
      resourceId: string
      assetCode: string
      assetScale: number
    })
  | (RunnerEventBase & {
      type: 'grant.requested'
      authServer: string
      access: Array<{
        type: 'incoming-payment' | 'quote' | 'outgoing-payment' | string
        actions: string[]
        identifier?: string
      }>
    })
  | (RunnerEventBase & {
      type: 'grant.finalized'
      authServer: string
    })
  | (RunnerEventBase & {
      type: 'grant.interactive_required'
      authServer: string
      redirectUrl: string
      callbackUrl: string
    })
  | (RunnerEventBase & {
      type: 'grant.continued'
      authServer: string
    })
  | (RunnerEventBase & {
      type: 'incomingPayment.created'
      resourceId: string
    })
  | (RunnerEventBase & {
      type: 'quote.created'
      resourceId: string
      debitAmount?: {
        assetCode: string
        assetScale: number
        value: string
      }
    })
  | (RunnerEventBase & {
      type: 'outgoingPayment.created'
      resourceId: string
    })

