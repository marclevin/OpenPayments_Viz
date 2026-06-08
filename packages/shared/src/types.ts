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
  // Illustrative scenarios that the real runner can't execute (e.g. multi-recipient split
  // payments, which the single-sequence runner doesn't support). When true, the UI blocks the
  // live TestNet transport and explains why. Optional, omit for fully runnable scenarios.
  mockOnly?: boolean
  // Shown to the user when `mockOnly` is true, to explain why live execution is unavailable.
  mockOnlyReason?: string
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
  // Which side of the payment is fixed:
  //  - 'fixed-receive' (default): the receiver gets exactly `incomingAmount`; the quote derives
  //    the (variable) debit the sender pays. This is the classic Open Payments invoice model.
  //  - 'fixed-send': the sender is debited exactly `debitAmount`; the incoming payment is created
  //    open-ended and the quote derives the (variable) amount the receiver gets.
  amountMode?: 'fixed-receive' | 'fixed-send'
  // The receiver's fixed amount. Required for 'fixed-receive'. The real runner uses the live
  // receiving wallet's assetCode/assetScale and only takes the `value` from here.
  incomingAmount?: { value: string; assetCode: string; assetScale: number }
  // The sender's fixed debit. Required for 'fixed-send'. The real runner uses the live sending
  // wallet's assetCode/assetScale and only takes the `value` from here.
  debitAmount?: { value: string; assetCode: string; assetScale: number }
  // Illustrative-only display hints for the web mock & timeline, which have no real quote to read
  // the converted amount from. The real runner IGNORES these entirely — it renders the live
  // wallet currencies and the actual quoted debit/receive amounts.
  display?: {
    // The variable side's currency (the side the quote derives): the receiver's currency for
    // 'fixed-send', the sender's currency for 'fixed-receive'. Lets the mock show two currencies.
    counterpartyAsset: { assetCode: string; assetScale: number }
    // Approx units of `counterpartyAsset` per 1 major unit of the fixed side's currency, used to
    // compute the "≈" converted figure in the mock (e.g. 0.858 EUR per USD, or 1.165 USD per EUR).
    fxRate: number
  }
  // ISO 8601 repeating interval for a recurring outgoing-payment grant, e.g. "R12/<start>/P1M".
  outgoingInterval?: string
  // Teaching failure injection (web mock only). When set, the mock run stops at `atStep` and emits a
  // runner.error with `message` instead of that step's success — used by the dedicated failure
  // scenarios. The real runner ignores this (real failures come from the network).
  mockFailure?: { atStep: StepId; message: string }
  // Split-payment scenarios fan a single customer payment out to multiple recipients, each with
  // its own incoming-payment, quote, and outgoing-payment. When present, the mock generator emits
  // a branch per recipient instead of the single linear sequence; the shared stages above
  // (walletResolve, quoteGrant, outgoingGrantInteractive, outgoingGrantContinue) are reused across
  // all branches. The single incomingPayment/quote/outgoingPayment step ids above should point at
  // the first recipient as a harmless fallback for any consumer that ignores `recipients`.
  recipients?: SplitRecipient[]
}

export type SplitRecipient = {
  // Stable key (e.g. 'merchant' | 'platform') — used to derive unique mock event ids per branch.
  key: string
  // Human label used in mock event prose.
  label: string
  incomingAmount: { value: string; assetCode: string; assetScale: number }
  steps: {
    incomingGrant: StepId
    incomingPayment: StepId
    quote: StepId
    outgoingPayment: StepId
  }
}

export type RunId = string
export type RunnerEventLevel = 'debug' | 'info' | 'warn' | 'error'

// The real HTTP request/response that produced an event. Secrets (Authorization/Signature headers,
// access tokens in bodies) are redacted before this leaves the runner. On TestNet this is captured
// live; the web mock synthesizes a representative version. Shown in the event detail's Raw HTTP view.
export type CapturedHttp = {
  method: string
  url: string
  requestHeaders?: Record<string, string>
  requestBody?: string
  status?: number
  responseBody?: string
}

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
  // The redacted request/response that produced this event, when available (post-call events only).
  http?: CapturedHttp
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
      // What the sender is debited. Real and exact from the quote (real runner); for the web mock
      // it is exact when the scenario fixes the send side, otherwise an FX estimate (see approxSide).
      debitAmount?: {
        assetCode: string
        assetScale: number
        value: string
      }
      // What the receiver gets. Same exactness rules as debitAmount.
      receiveAmount?: {
        assetCode: string
        assetScale: number
        value: string
      }
      // Web-mock only: which amount is an illustrative FX estimate (the side the quote derives).
      // The real runner omits this — both amounts come straight from the quote.
      approxSide?: 'debit' | 'receive'
      // When the quote's debitAmount stops being valid (ISO 8601). Real on TestNet; fabricated by
      // the mock. Optional — older events / some quotes may omit it.
      expiresAt?: string
    })
  | (RunnerEventBase & {
      type: 'outgoingPayment.created'
      resourceId: string
    })

