// Turns the raw runner event stream into a teaching-oriented view:
//  - humanizeEvent: a plain-English sentence + the one payload field worth highlighting
//  - groupEventsIntoBlocks: clusters events by their step into "interaction blocks"
//  - resolveWhy: pulls the "why" prose straight from the scenario definition (no new corpus)
//  - toCuratedLines: a structured, highlightable JSON view that hides boilerplate
//
// All functions are pure and framework-free (mirrors lib/explain.ts), so they're easy to test.
import type { FlowDefinition, FlowStep, RunnerEvent } from '@opviz/shared'
import { approxAmount, renderTemplate, type RunAmounts } from './amounts'
import { getEntityColorVar, type EntityColorVar } from './colorMap'
import { prettyJson } from './format'

export type EventIcon = 'request' | 'create' | 'consent' | 'error' | 'log' | 'lifecycle'

// A small labelled value rendered as a monospace "code chip" beneath the sentence. `tone: 'asset'`
// tints it green (the payment/money colour); 'code' is the neutral default (URLs, hosts, ids).
export type EventFact = { label: string; value: string; tone?: 'code' | 'asset' }

export type EventNarration = {
  // Human label of the acting entity, e.g. 'Client', 'Auth Server', 'Sender Wallet'.
  actor: string
  // CSS var for that entity's colour (drives the branch dot).
  actorColorVar: EntityColorVar
  // Collapsed-row sentence; entity names are spelled out so highlightEntities can colour them.
  sentence: string
  // Optional structured values shown as monospace chips (keeps URLs/asset codes legible).
  facts?: EventFact[]
  // Top-level event key to visually highlight when the row is expanded (or undefined).
  keyField?: string
  icon: EventIcon
}

// --- private helpers -------------------------------------------------------

function host(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

// The path portion of a resource URL (e.g. ".../incoming-payments/ip_123" -> "/incoming-payments/ip_123").
// Open Payments resources are all addressable URLs; the path is the legible, teaching-relevant part.
function resourcePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

function walletLabel(wallet: 'sending' | 'receiving' | 'client'): string {
  if (wallet === 'sending') return 'Sender Wallet'
  if (wallet === 'receiving') return 'Receiver Wallet'
  return 'Client'
}

// --- humanizeEvent ---------------------------------------------------------

export function humanizeEvent(e: RunnerEvent, _flow: FlowDefinition): EventNarration {
  const colorFor = (label: string, kind?: string): EntityColorVar => getEntityColorVar(label, kind)

  switch (e.type) {
    case 'run.started':
      return { actor: 'Run', actorColorVar: '--accent', sentence: 'Run started', icon: 'lifecycle' }
    case 'run.completed':
      return { actor: 'Run', actorColorVar: '--accent', sentence: 'Run completed', icon: 'lifecycle' }
    case 'run.paused':
      return { actor: 'Run', actorColorVar: '--accent', sentence: 'Run paused', icon: 'lifecycle' }
    case 'run.resumed':
      return { actor: 'Run', actorColorVar: '--accent', sentence: 'Run resumed', icon: 'lifecycle' }

    case 'walletAddress.resolved': {
      const label = walletLabel(e.wallet)
      return {
        actor: label,
        actorColorVar: colorFor(label),
        sentence: `Client resolved the ${label} details`,
        facts: [
          { label: 'Auth Server', value: host(e.authServer), tone: 'code' },
          { label: 'Asset', value: e.assetCode, tone: 'asset' },
        ],
        keyField: 'walletAddressUrl',
        icon: 'request',
      }
    }

    case 'grant.requested': {
      const types = e.access.map((a) => a.type).join(', ')
      const actions = Array.from(new Set(e.access.flatMap((a) => a.actions)))
      return {
        actor: 'Client',
        actorColorVar: colorFor('Client', 'client'),
        sentence: `Client requested a grant for ${types || 'access'}`,
        facts: actions.length ? [{ label: 'Actions', value: actions.join(', '), tone: 'code' }] : undefined,
        keyField: 'access',
        icon: 'request',
      }
    }

    case 'grant.interactive_required':
      return {
        actor: 'Auth Server',
        actorColorVar: colorFor('Auth Server', 'authServer'),
        sentence: 'Auth Server required interactive consent',
        keyField: 'redirectUrl',
        icon: 'consent',
      }

    case 'grant.continued':
      return {
        actor: 'Client',
        actorColorVar: colorFor('Client', 'client'),
        sentence: 'Client continued the grant after consent',
        icon: 'request',
      }

    case 'grant.finalized':
      return {
        actor: 'Auth Server',
        actorColorVar: colorFor('Auth Server', 'authServer'),
        sentence: 'Auth Server finalized the grant and issued a token',
        icon: 'request',
      }

    case 'incomingPayment.created':
      return {
        actor: 'Client',
        actorColorVar: colorFor('Client', 'client'),
        sentence: 'Client created the Incoming Payment',
        facts: [{ label: 'Resource', value: resourcePath(e.resourceId), tone: 'code' }],
        keyField: 'resourceId',
        icon: 'create',
      }

    case 'quote.created': {
      // The quote fixes one side and derives the other (the converted amount, after FX + fees).
      // In the web mock the derived side is an illustrative estimate, flagged via approxSide and
      // rendered with a leading "≈" (see approxAmount).
      return {
        actor: 'Client',
        actorColorVar: colorFor('Client', 'client'),
        sentence: 'Client created a Quote',
        facts: [
          ...(e.debitAmount
            ? [{ label: 'Debit', value: approxAmount('debit', e.approxSide, e.debitAmount), tone: 'asset' as const }]
            : []),
          ...(e.receiveAmount
            ? [{ label: 'Receive', value: approxAmount('receive', e.approxSide, e.receiveAmount), tone: 'asset' as const }]
            : []),
          { label: 'Resource', value: resourcePath(e.resourceId), tone: 'code' as const },
        ],
        keyField: 'debitAmount',
        icon: 'create',
      }
    }

    case 'outgoingPayment.created':
      return {
        actor: 'Client',
        actorColorVar: colorFor('Client', 'client'),
        sentence: 'Client created the Outgoing Payment — a payment instruction; the account-servicing entity settles it',
        facts: [{ label: 'Resource', value: resourcePath(e.resourceId), tone: 'code' }],
        keyField: 'resourceId',
        icon: 'create',
      }

    case 'runner.log':
      return {
        actor: 'Client',
        actorColorVar: '--accent',
        sentence: e.message,
        keyField: e.data !== undefined ? 'data' : undefined,
        icon: 'log',
      }

    case 'runner.error':
      return {
        actor: 'Client',
        actorColorVar: '--accent',
        sentence: `Error: ${e.message}`,
        keyField: 'error',
        icon: 'error',
      }

    default: {
      // Defensive: a future RunnerEventType still renders, never crashes.
      const fallback = e as RunnerEvent
      return { actor: 'Client', actorColorVar: '--accent', sentence: fallback.type, icon: 'log' }
    }
  }
}

// --- groupEventsIntoBlocks -------------------------------------------------

export const RUN_LANE_KEY = '__run__'

export type EventBlock = {
  // null => the ungrouped "Run" lane (lifecycle + step-less logs).
  stepId: string | null
  step?: FlowStep
  title: string
  group?: string
  events: RunnerEvent[]
  firstTs: string
  lastTs: string
}

// Single pass over events in arrival order. Each step's events stay contiguous; blocks keep
// first-seen order so they read in the order the run progressed. Step-less events collect into
// one "Run" lane.
export function groupEventsIntoBlocks(events: RunnerEvent[], flow: FlowDefinition): EventBlock[] {
  const order: string[] = []
  const byKey = new Map<string, EventBlock>()

  for (const e of events) {
    const stepId = e.stepId ?? null
    const key = stepId ?? RUN_LANE_KEY
    let block = byKey.get(key)
    if (!block) {
      const step = stepId ? flow.steps.find((s) => s.id === stepId) : undefined
      block = {
        stepId,
        step,
        title: step?.title ?? (stepId === null ? 'Run' : stepId),
        group: step?.group,
        events: [],
        firstTs: e.ts,
        lastTs: e.ts,
      }
      byKey.set(key, block)
      order.push(key)
    }
    block.events.push(e)
    block.lastTs = e.ts
  }

  return order.map((k) => byKey.get(k)!)
}

// --- resolveWhy ------------------------------------------------------------

export type WhyContent = {
  title: string
  what?: string
  roles: Array<{ label: string; body: string }>
  edges: Array<{ label: string; body: string }>
}

// Pulls the "why" entirely from the scenario definition: the step description, the per-node
// roles, and the involved request/redirect edges' descriptions. Returns null for the Run lane
// or an unknown step (so no info icon is shown).
export function resolveWhy(block: EventBlock, flow: FlowDefinition, amounts?: RunAmounts): WhyContent | null {
  const step = block.step
  if (!step) return null

  const roles: WhyContent['roles'] = []
  if (step.nodeRoles) {
    for (const [nodeId, body] of Object.entries(step.nodeRoles)) {
      const label = flow.nodes.find((n) => n.id === nodeId)?.label ?? nodeId
      roles.push({ label, body: renderTemplate(body, amounts) })
    }
  }

  const edges: WhyContent['edges'] = []
  for (const edgeId of step.involvedEdgeIds ?? []) {
    const edge = flow.edges.find((ed) => ed.id === edgeId)
    // Only network hops carry a meaningful "why"; structural relation/creation edges don't.
    if (!edge || !edge.description) continue
    if (edge.kind !== 'request' && edge.kind !== 'redirect') continue
    edges.push({ label: edge.label ?? edge.kind, body: renderTemplate(edge.description, amounts) })
  }

  return { title: step.title, what: step.description, roles, edges }
}

// --- toCuratedLines --------------------------------------------------------

export type JsonLine = {
  key: string
  value: string
  highlight: boolean
  boilerplate: boolean
}

// The RunnerEventBase plumbing — useful for debugging, noise for learning. Hidden by default.
// `http` is hidden here too: it's rendered separately as a dedicated Raw HTTP block in the EventLog.
const BOILERPLATE = new Set(['id', 'runId', 'ts', 'level', 'type', 'http'])

// Builds the curated JSON as structured lines so highlighting is a per-key boolean rather than
// a brittle regex over a stringified blob. Nested objects/arrays are pretty-printed in place.
export function toCuratedLines(e: RunnerEvent, keyField?: string): JsonLine[] {
  const lines: JsonLine[] = []
  for (const [key, raw] of Object.entries(e as Record<string, unknown>)) {
    const value = raw !== null && typeof raw === 'object' ? prettyJson(raw) : String(raw)
    lines.push({
      key,
      value,
      highlight: key === keyField,
      boilerplate: BOILERPLATE.has(key),
    })
  }
  return lines
}
