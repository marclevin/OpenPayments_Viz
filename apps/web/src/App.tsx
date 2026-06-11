import { defaultScenarioId, getExecutionSpec, getScenarioById, scenarios } from '@opviz/shared/scenarios'
import type { FlowDefinition, FlowEdge, FlowNode as FlowNodeT, FlowStep, RunnerEvent, StepStatus } from '@opviz/shared'
import { getStepStatusFromEvents } from '@opviz/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, { Background, MarkerType, ReactFlowProvider, useReactFlow } from 'reactflow'
import { EventLog } from './components/EventLog'
import { FlowNode } from './components/FlowNode'
import { IntroDialog } from './components/IntroDialog'
import { LegendOverlay } from './components/LegendOverlay'
import { ParallelEdge } from './components/ParallelEdge'
import { ParameterEditor } from './components/ParameterEditor'
import { QuoteBreakdown } from './components/QuoteBreakdown'
import { amountsFromSpec, renderTemplate, resolveRunAmounts, type RunAmounts } from './lib/amounts'
import { getEntityColorVar, highlightEntities } from './lib/colorMap'
import { createRunnerClient, type ResolvedWallet, type RunnerConfig } from './lib/eventStream'
import { applyParams, deriveParams, toSpecOverrides, type ScenarioParams } from './lib/scenarioParams'
import { type ExplainSegment, explainEdge, explainNode, explainStep, nodeStatus } from './lib/explain'
import { makeMockConsentCompletionEvents, makeMockRunEvents } from './lib/mockRun'

type TransportMode = 'mock' | 'sse'
type BottomTab = 'inspector' | 'description' | 'params' | 'setup'
type Selection = { kind: 'node' | 'edge' | 'step'; id: string } | null

const nodeTypes = { flowNode: FlowNode }
const edgeTypes = { parallel: ParallelEdge }

// Prefix edge labels with a monochrome glyph so each kind reads as a legend entry:
// ⚡ network/API call, ⊕ resource creation, ↪ human/browser consent hop. Structural
// relations and responses get no glyph so they stay quiet.
const edgeKindGlyph: Record<string, string> = {
  request: '⚡',
  creation: '⊕',
  redirect: '↪',
}
function decorateEdgeLabel(kind: string, label?: string): string | undefined {
  if (!label) return label
  const glyph = edgeKindGlyph[kind]
  return glyph ? `${glyph} ${label}` : label
}

// "Copy as path" (Windows) and "Copy as Pathname" (macOS) often wrap the path in quotes, e.g.
// "C:\Users\me\USD_KEY.key". Strip a single layer of matching wrapping quotes (and surrounding
// whitespace) so the pasted path is usable as-is.
function stripWrappingQuotes(raw: string): string {
  const v = raw.trim()
  if (v.length >= 2) {
    const first = v[0]
    const last = v[v.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1)
    }
  }
  return v
}

function normalizeWalletAddressInput(raw: string): string {
  const v = raw.trim()
  if (!v) return ''

  // Payment pointers: $example.com/alice -> https://example.com/alice
  if (v.startsWith('$')) return `https://${v.slice(1)}`

  return v
}

function pillClass(status: StepStatus) {
  if (status === 'success') return 'pill statusPill ok'
  if (status === 'error') return 'pill statusPill err'
  if (status === 'active') return 'pill statusPill act'
  return 'pill statusPill'
}

function NarrationParagraph({ text }: { text: string }) {
  const parts = useMemo(() => highlightEntities(text), [text])
  return (
    <p>
      {parts.map((p, idx) =>
        typeof p === 'string' ? (
          <span key={idx}>{p}</span>
        ) : (
          <span key={idx} className="kw" style={{ color: `var(${p.varName})` }}>
            {p.t}
          </span>
        )
      )}
    </p>
  )
}

// A plain-language overview of the selected scenario: the title, its one-line summary, and a
// grouped walkthrough built from each step's own prose. All text runs through NarrationParagraph
// so entity names (Client, Auth Server, Quote…) keep their colour coding.
function ScenarioDescription({
  flow,
  amounts,
  failure,
}: {
  flow: FlowDefinition
  amounts?: RunAmounts
  failure?: { atStep: string; message: string }
}) {
  // Collapse consecutive steps that share a `group` label into one section.
  const groups = useMemo(() => {
    const out: Array<{ label?: string; steps: FlowStep[] }> = []
    for (const step of flow.steps) {
      const last = out[out.length - 1]
      if (last && last.label === step.group) last.steps.push(step)
      else out.push({ label: step.group, steps: [step] })
    }
    return out
  }, [flow])

  // For failure scenarios, the steps reuse the happy-path prose. Mark the step that fails and the
  // steps after it ("not reached") so the walkthrough doesn't read as a fully successful payment.
  const failIdx = failure ? flow.steps.findIndex((s) => s.id === failure.atStep) : -1
  const notReached = new Set(failIdx >= 0 ? flow.steps.slice(failIdx + 1).map((s) => s.id) : [])

  return (
    <div className="scenarioDesc">
      <h3 className="scenarioDescTitle">{flow.title}</h3>
      {flow.description && (
        <div className="scenarioDescLede">
          <NarrationParagraph text={renderTemplate(flow.description, amounts)} />
        </div>
      )}
      <div className="scenarioWalkthrough">
        {groups.map((g, gi) => (
          <section key={gi} className="scenarioGroup">
            {g.label && <div className="scenarioGroupLabel">{g.label}</div>}
            <ol className="scenarioSteps">
              {g.steps.map((s) => {
                const isFail = s.id === failure?.atStep
                const isSkipped = notReached.has(s.id)
                return (
                  <li
                    key={s.id}
                    className={`scenarioStep${isFail ? ' stepFails' : ''}${isSkipped ? ' stepSkipped' : ''}`}
                  >
                    <div className="scenarioStepTitle">
                      {s.title}
                      {isFail ? <span className="stepFailTag"> ✗ fails here</span> : null}
                      {isSkipped ? <span className="stepSkipTag"> · not reached</span> : null}
                    </div>
                    {isFail && failure ? (
                      <p className="stepFailMsg">{failure.message}</p>
                    ) : s.description ? (
                      <NarrationParagraph text={renderTemplate(s.description, amounts)} />
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}

function CollapsibleCard({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string
  hint?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`configCard ${open ? 'open' : ''}`}>
      <button type="button" className="configCardHeader" onClick={onToggle} aria-expanded={open}>
        <span className="configCardChevron">{open ? '▾' : '▸'}</span>
        <span className="configCardTitle">{title}</span>
        {hint ? <span className="configCardHint">{hint}</span> : null}
      </button>
      {open ? <div className="configCardBody">{children}</div> : null}
    </div>
  )
}

// Light-touch helper: shows the normalized URL when the input is a payment pointer
// (or otherwise differs after normalization). No blocking validation.
function AddressPreview({ value }: { value: string }) {
  const normalized = normalizeWalletAddressInput(value)
  if (!value.trim() || normalized === value.trim()) return null
  return (
    <div className="subtleHelp">
      <span className="mono">{value.trim()}</span> → <span className="mono">{normalized}</span>
    </div>
  )
}

type BadgeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: ResolvedWallet }
  | { status: 'error'; error: string; offline: boolean }

// Live wallet-address validation: debounced lookup via the runner's /resolve endpoint. Surfaces the
// wallet's real currency. Degrades gracefully when the runner isn't running (pure mock setups).
function WalletBadge({ value, baseUrl }: { value: string; baseUrl: string }) {
  const [state, setState] = useState<BadgeState>({ status: 'idle' })

  useEffect(() => {
    const url = normalizeWalletAddressInput(value)
    if (!url) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })
    const t = window.setTimeout(async () => {
      try {
        const data = await createRunnerClient(baseUrl).resolveWallet(url)
        if (!cancelled) setState({ status: 'ok', data })
      } catch (e) {
        const msg = (e as Error).message || "couldn't resolve"
        // A thrown TypeError ("Failed to fetch") means the runner is unreachable, not a bad address.
        const offline = /failed to fetch|networkerror|load failed/i.test(msg)
        if (!cancelled) setState({ status: 'error', error: msg, offline })
      }
    }, 500)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [value, baseUrl])

  if (state.status === 'idle') return null
  if (state.status === 'loading') return <div className="walletBadge loading">Resolving…</div>
  if (state.status === 'error') {
    return (
      <div className="walletBadge err">
        {state.offline ? 'Live validation needs the runner running.' : `✗ ${state.error}`}
      </div>
    )
  }
  const { assetCode, assetScale } = state.data
  return (
    <div className="walletBadge ok">
      ✓ {assetCode} wallet (scale {assetScale})
    </div>
  )
}

type Focus =
  | { kind: 'step'; step: FlowStep }
  | { kind: 'node'; node: FlowNodeT }
  | { kind: 'edge'; edge: FlowEdge }
  | null

function focusKey(focus: Focus): string {
  if (!focus) return ''
  if (focus.kind === 'step') return `step:${focus.step.id}`
  if (focus.kind === 'node') return `node:${focus.node.id}`
  return `edge:${focus.edge.id}`
}

function focusNodeTargets(focus: Focus): string[] {
  if (!focus) return []
  if (focus.kind === 'step') return focus.step.involvedNodeIds
  if (focus.kind === 'node') return [focus.node.id]
  return [focus.edge.source, focus.edge.target]
}

function useAutoFitOnFocus(focus: Focus) {
  const rf = useReactFlow()
  const key = focusKey(focus)
  useEffect(() => {
    const ids = focusNodeTargets(focus)
    if (ids.length === 0) return
    const nodes = rf.getNodes().filter((n) => ids.includes(String(n.id)))
    if (!nodes.length) return
    rf.fitView({ nodes, padding: 0.35, duration: 420 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

function AppInner() {
  const [transport, setTransport] = useState<TransportMode>('mock')
  const [baseUrl, setBaseUrl] = useState('http://localhost:3344')
  // The selected scenario drives both the visual graph and the runner config.
  const [scenarioId, setScenarioId] = useState<string>(defaultScenarioId)
  const flow = useMemo(() => getScenarioById(scenarioId) ?? scenarios[0]!, [scenarioId])
  // Student-editable parameters for the current scenario; null until derived from its spec. Reset
  // whenever the scenario changes (see effect below).
  const [params, setParams] = useState<ScenarioParams | null>(null)
  useEffect(() => {
    setParams(deriveParams(getExecutionSpec(scenarioId)))
  }, [scenarioId])
  // The spec actually executed: base scenario spec with the student's parameter edits applied.
  const effectiveSpec = useMemo(() => {
    const base = getExecutionSpec(scenarioId)
    return params ? applyParams(base, params) : base
  }, [scenarioId, params])
  // The currencies/amounts this scenario's prose assumes, used to warn when a configured wallet's
  // real currency differs and as the stable example in the Scenario Description tab.
  const specAmounts = useMemo(() => amountsFromSpec(effectiveSpec), [effectiveSpec])
  // Some scenarios are illustrative and can't run against the live TestNet (e.g. split payments,
  // which the single-sequence runner can't orchestrate). For those we lock the transport to mock.
  const mockOnly = Boolean(flow.mockOnly)
  const [keyId, setKeyId] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [clientWalletAddressUrl, setClientWalletAddressUrl] = useState('')
  const [sendingWalletAddressUrl, setSendingWalletAddressUrl] = useState('')
  const [receivingWalletAddressUrl, setReceivingWalletAddressUrl] = useState('')
  const [callbackPort, setCallbackPort] = useState<number>(3999)
  const [uiBaseUrl, setUiBaseUrl] = useState('http://localhost:5173/')

  type SavedScenario = {
    id: string
    name: string
    keyId: string
    clientWalletAddressUrl: string
    sendingWalletAddressUrl: string
    receivingWalletAddressUrl: string
    callbackPort: number
    baseUrl: string
    uiBaseUrl: string
    updatedAt: string
  }
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState<string>('')
  const [scenarioName, setScenarioName] = useState<string>('')
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const [narrationCollapsed, setNarrationCollapsed] = useState(false)
  // Legend overlay (pinned over the Flow graph) and the first-run orientation dialog.
  const [legendOpen, setLegendOpen] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  // Transient toast notice (e.g. "fill in your TestNet credentials first").
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  // Scenario Controls panel sizing (draggable splitter + maximize toggle).
  const [controlsHeight, setControlsHeight] = useState<number>(280)
  const [controlsMaximized, setControlsMaximized] = useState(false)
  const centerColRef = useRef<HTMLDivElement | null>(null)
  const restoreHeightRef = useRef<number>(280)

  // Collapsible config sections (all open by default).
  const [openSections, setOpenSections] = useState({ scenario: true, credentials: true, addresses: true })

  const [events, setEvents] = useState<RunnerEvent[]>([])
  // `selectedStepId` drives ONLY the timeline row highlight + consent logic.
  const [selectedStepId, setSelectedStepId] = useState<string>(flow.steps[0]?.id ?? '')
  // `selection` is the unified thing being explained + focused in the graph (node | edge | step).
  const [selection, setSelection] = useState<Selection>({ kind: 'step', id: flow.steps[0]?.id ?? '' })
  const [isPaused, setIsPaused] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [connected, setConnected] = useState<'disconnected' | 'connected'>('disconnected')
  const [bottomTab, setBottomTab] = useState<BottomTab>('inspector')
  const [consentAck, setConsentAck] = useState(false)

  const lastRedirectUrl = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!
      if (e.type === 'grant.interactive_required') return e.redirectUrl
    }
    return undefined
  }, [events])

  const consentState = useMemo(() => {
    // Consider consent "needed" if we have an interactive-required event without a later grant.continued.
    let lastInteractiveIdx = -1
    let continuedAfterInteractive = false
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!
      if (e.type === 'grant.interactive_required') {
        lastInteractiveIdx = i
        continuedAfterInteractive = false
      }
      if (lastInteractiveIdx >= 0 && i > lastInteractiveIdx && e.type === 'grant.continued') {
        continuedAfterInteractive = true
      }
    }
    const needsConsent = lastInteractiveIdx >= 0 && !continuedAfterInteractive
    return { needsConsent, hasInteractive: lastInteractiveIdx >= 0 }
  }, [events])

  const statusesByStepId = useMemo(() => {
    const map: Record<string, StepStatus> = {}
    for (const step of flow.steps) {
      map[step.id] = getStepStatusFromEvents(step.id, events)
    }
    return map
  }, [events, flow.steps])

  // Resolve the unified `selection` to the concrete node/edge/step it points at.
  const focus = useMemo<Focus>(() => {
    if (!selection) return null
    if (selection.kind === 'step') {
      const step = flow.steps.find((s) => s.id === selection.id)
      return step ? { kind: 'step', step } : null
    }
    if (selection.kind === 'node') {
      const node = flow.nodes.find((n) => n.id === selection.id)
      return node ? { kind: 'node', node } : null
    }
    const edge = flow.edges.find((e) => e.id === selection.id)
    return edge ? { kind: 'edge', edge } : null
  }, [selection, flow.nodes, flow.edges, flow.steps])

  // Live amounts/currencies for the current run, used to fill {tokens} in scenario prose. For a
  // live (sse) run these come from the event stream; for mock, from the spec + display FX hint.
  const runAmounts = useMemo(
    () => resolveRunAmounts({ transport, spec: effectiveSpec, events }),
    [transport, effectiveSpec, events]
  )

  const narration = useMemo<ExplainSegment[]>(() => {
    if (!focus) return [{ label: '', body: 'Select a component, an arrow, or a timeline step to see what it does.' }]
    if (focus.kind === 'node') {
      // A component is explained relative to the step currently selected in the timeline.
      const timelineStep = flow.steps.find((s) => s.id === selectedStepId)
      return explainNode(focus.node, timelineStep, nodeStatus(focus.node.id, statusesByStepId, flow), runAmounts)
    }
    if (focus.kind === 'edge') {
      const st = focus.edge.stepId ? statusesByStepId[focus.edge.stepId] : undefined
      return explainEdge(focus.edge, st, runAmounts)
    }
    return explainStep(focus.step, statusesByStepId[focus.step.id], consentState.needsConsent, runAmounts)
  }, [focus, selectedStepId, statusesByStepId, consentState.needsConsent, flow, runAmounts])

  // Header title + type badge + accent color for the narration panel, derived from `focus`.
  const focusHeader = useMemo(() => {
    if (!focus) return { title: '—', badge: '', colorVar: '--accent' as string }
    if (focus.kind === 'node') {
      return { title: focus.node.label, badge: 'Component', colorVar: getEntityColorVar(focus.node.label, focus.node.kind) as string }
    }
    if (focus.kind === 'edge') {
      const sourceNode = flow.nodes.find((n) => n.id === focus.edge.source)
      return {
        title: focus.edge.label ?? 'Relationship',
        badge:
          focus.edge.kind === 'relation'
            ? 'Relationship'
            : focus.edge.kind === 'creation'
              ? 'Creates'
              : 'Request',
        colorVar: (sourceNode ? getEntityColorVar(sourceNode.label, sourceNode.kind) : '--accent') as string,
      }
    }
    return { title: focus.step.title, badge: 'Step', colorVar: '--accent' as string }
  }, [focus, flow.nodes])

  const clientRef = useRef<ReturnType<typeof createRunnerClient> | null>(null)
  const timerRef = useRef<number | null>(null)
  const didMountScenarioRef = useRef(false)
  // True once the user has clicked a step/node/edge: stops the explanation panel from
  // auto-following the running step so their manual selection sticks. Re-armed on Start
  // and on scenario switch.
  const userPinnedRef = useRef(false)

  // Mock playback driver: refs so the running loop always reads the latest pause/speed
  // (avoids the stale-closure bug where pausing/speed changes were ignored mid-run).
  const isPausedRef = useRef(false)
  const speedRef = useRef(1)
  const playbackRef = useRef<{ queue: RunnerEvent[]; i: number } | null>(null)
  const appendEventRef = useRef<(e: RunnerEvent) => void>(() => {})

  const pumpPlayback = useCallback(() => {
    const pb = playbackRef.current
    if (!pb || isPausedRef.current) return
    if (pb.i >= pb.queue.length) {
      playbackRef.current = null
      return
    }
    appendEventRef.current(pb.queue[pb.i]!)
    pb.i += 1
    timerRef.current = window.setTimeout(pumpPlayback, Math.max(80, 600 / speedRef.current))
  }, [])

  // Switching scenarios starts clean: clear events, reset selection to the first step,
  // and drop any live runner connection so state can't bleed across scenarios.
  useEffect(() => {
    if (!didMountScenarioRef.current) {
      didMountScenarioRef.current = true
      return
    }
    clearTimer()
    playbackRef.current = null
    setEvents([])
    setIsRunning(false)
    setIsPaused(false)
    isPausedRef.current = false
    userPinnedRef.current = false
    const first = flow.steps[0]?.id ?? ''
    setSelectedStepId(first)
    setSelection(first ? { kind: 'step', id: first } : null)
    if (transport !== 'mock') disconnectFromRunner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId])

  // Mirror state into refs the playback loop reads.
  useEffect(() => {
    appendEventRef.current = appendEvent
  })
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // Mock-only scenarios can't use the live TestNet transport: force back to mock if one is
  // selected while on SSE. The Method dropdown also disables the TestNet option below.
  useEffect(() => {
    if (mockOnly && transport !== 'mock') setTransport('mock')
  }, [mockOnly, transport])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('opviz.scenarios.v1')
      if (raw) {
        const parsed = JSON.parse(raw) as SavedScenario[]
        if (Array.isArray(parsed)) setSavedScenarios(parsed)
      }
      const h = Number(localStorage.getItem('opviz.controlsHeight.v1'))
      if (Number.isFinite(h) && h >= 160) setControlsHeight(h)
      // First-run orientation: show the intro dialog until the visitor has dismissed it once.
      const introRaw = localStorage.getItem('opviz.intro.v1')
      const introSeen = introRaw ? Boolean((JSON.parse(introRaw) as { seen?: boolean }).seen) : false
      if (!introSeen) setIntroOpen(true)
    } catch {
      // ignore
    }
  }, [])

  // Transient toast: auto-dismisses after a few seconds; a new toast replaces the old one.
  function showToast(title: string, body: string) {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ title, body })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 8000)
  }
  function dismissToast() {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setToast(null)
  }

  // Closing the intro records that it's been seen so it won't auto-open on future loads. The
  // header "?" button still reopens it on demand (without clearing the flag).
  function dismissIntro() {
    setIntroOpen(false)
    try {
      localStorage.setItem('opviz.intro.v1', JSON.stringify({ seen: true }))
    } catch {
      // ignore
    }
  }

  function persistScenarios(next: SavedScenario[]) {
    setSavedScenarios(next)
    try {
      localStorage.setItem('opviz.scenarios.v1', JSON.stringify(next))
    } catch {
      // ignore
    }
  }

  function applyScenario(s: SavedScenario) {
    setScenarioName(s.name)
    setKeyId(s.keyId)
    setClientWalletAddressUrl(s.clientWalletAddressUrl)
    setSendingWalletAddressUrl(s.sendingWalletAddressUrl)
    setReceivingWalletAddressUrl(s.receivingWalletAddressUrl)
    setCallbackPort(s.callbackPort)
    setBaseUrl(s.baseUrl)
    setUiBaseUrl(s.uiBaseUrl)
  }

  function buildScenario(id: string, name: string): SavedScenario {
    return {
      id,
      name,
      keyId,
      clientWalletAddressUrl,
      sendingWalletAddressUrl,
      receivingWalletAddressUrl,
      callbackPort,
      baseUrl,
      uiBaseUrl,
      updatedAt: new Date().toISOString(),
    }
  }

  function fallbackName() {
    return scenarioName.trim() || sendingWalletAddressUrl.trim() || 'Untitled scenario'
  }

  // Save: update the active scenario if one is selected, otherwise create a new one.
  function saveScenario() {
    const id = selectedScenario || crypto.randomUUID()
    const next = [buildScenario(id, fallbackName()), ...savedScenarios.filter((x) => x.id !== id)].slice(0, 20)
    persistScenarios(next)
    setSelectedScenario(id)
  }

  // Save as new: always create a fresh entry, leaving the original untouched.
  function saveScenarioAsNew() {
    const id = crypto.randomUUID()
    const next = [buildScenario(id, fallbackName()), ...savedScenarios].slice(0, 20)
    persistScenarios(next)
    setSelectedScenario(id)
  }

  function duplicateScenario() {
    const source = savedScenarios.find((x) => x.id === selectedScenario)
    if (!source) return
    const id = crypto.randomUUID()
    const copy: SavedScenario = { ...source, id, name: `${source.name} (copy)`, updatedAt: new Date().toISOString() }
    persistScenarios([copy, ...savedScenarios].slice(0, 20))
    setSelectedScenario(id)
    setScenarioName(copy.name)
  }

  function deleteScenario() {
    if (!selectedScenario) return
    const target = savedScenarios.find((x) => x.id === selectedScenario)
    if (!window.confirm(`Delete scenario "${target?.name ?? 'Untitled'}"? This cannot be undone.`)) return
    persistScenarios(savedScenarios.filter((x) => x.id !== selectedScenario))
    setSelectedScenario('')
  }

  // --- Scenario Controls resize (draggable splitter + maximize) ---
  function commitControlsHeight(h: number) {
    setControlsHeight(h)
    try {
      localStorage.setItem('opviz.controlsHeight.v1', String(Math.round(h)))
    } catch {
      // ignore
    }
  }

  function startControlsResize(e: React.MouseEvent) {
    e.preventDefault()
    setControlsMaximized(false)
    const container = centerColRef.current
    const onMove = (ev: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const max = rect.height - 160
      const next = Math.min(Math.max(rect.bottom - ev.clientY, 160), Math.max(max, 160))
      setControlsHeight(next)
    }
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const rect = container?.getBoundingClientRect()
      if (rect) {
        const max = rect.height - 160
        commitControlsHeight(Math.min(Math.max(rect.bottom - ev.clientY, 160), Math.max(max, 160)))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function toggleMaximizeControls() {
    const container = centerColRef.current
    if (!controlsMaximized) {
      restoreHeightRef.current = controlsHeight
      const rect = container?.getBoundingClientRect()
      const target = rect ? rect.height - 132 : 640
      setControlsMaximized(true)
      commitControlsHeight(target)
    } else {
      setControlsMaximized(false)
      commitControlsHeight(restoreHeightRef.current)
    }
  }

  // Which nodes/edges are highlighted is driven by the unified `focus`, not the timeline.
  const focusNodeIds = useMemo(() => {
    if (!focus) return new Set<string>()
    if (focus.kind === 'step') return new Set(focus.step.involvedNodeIds)
    if (focus.kind === 'node') return new Set([focus.node.id])
    return new Set([focus.edge.source, focus.edge.target])
  }, [focus])
  const focusEdgeIds = useMemo(() => {
    if (!focus) return new Set<string>()
    if (focus.kind === 'step') return new Set(focus.step.involvedEdgeIds ?? [])
    if (focus.kind === 'edge') return new Set([focus.edge.id])
    return new Set<string>()
  }, [focus])

  const { nodes, edges } = useMemo(() => {
    const n = flow.nodes.map((node) => {
      const status = nodeStatus(node.id, statusesByStepId, flow)
      return {
        id: node.id,
        type: 'flowNode',
        position: node.position,
        data: { label: node.label, kind: node.kind, status, selected: focusNodeIds.has(node.id) },
      }
    })

    // Edges that share the same source→target stack on top of each other and their labels
    // collide. Count each group up front so we can fan them apart with a per-edge offset below.
    // Redirect is excluded — it runs the other direction on its own handles.
    const parallelTotals: Record<string, number> = {}
    for (const edge of flow.edges) {
      if (edge.kind === 'redirect') continue
      const key = `${edge.source}->${edge.target}`
      parallelTotals[key] = (parallelTotals[key] ?? 0) + 1
    }
    const parallelSeen: Record<string, number> = {}
    const PARALLEL_SPACING = 30

    const e = flow.edges.map((edge) => {
      const st = edge.stepId ? statusesByStepId[edge.stepId] : undefined
      const selected = focusEdgeIds.has(edge.id)
      const isRequest = edge.kind === 'request'
      const isRedirect = edge.kind === 'redirect'
      const isRelation = edge.kind === 'relation'
      const isResponse = edge.kind === 'response'
      const isCreation = edge.kind === 'creation'
      const isActive = Boolean(edge.stepId && statusesByStepId[edge.stepId] === 'active')
      // Fan parallel edges (same source→target) apart so their labels don't overlap.
      const pairKey = `${edge.source}->${edge.target}`
      const groupTotal = isRedirect ? 1 : parallelTotals[pairKey] ?? 1
      const groupIndex = isRedirect ? 0 : (parallelSeen[pairKey] = (parallelSeen[pairKey] ?? -1) + 1)
      const isParallel = groupTotal > 1
      const parallelOffset = isParallel ? (groupIndex - (groupTotal - 1) / 2) * PARALLEL_SPACING : 0
      const strokeColor =
        st === 'error'
          ? 'var(--statusError)'
          : st === 'success'
            ? 'var(--statusOk)'
            : st === 'active'
              ? 'var(--statusActive)'
              : isRelation
                ? 'rgba(15, 23, 42, 0.18)'
                : isCreation
                  ? 'rgba(16, 122, 87, 0.7)'
                  : isRedirect
                    ? 'var(--edgeRedirect)'
                    : isRequest
                      ? 'rgba(0, 59, 92, 0.58)'
                      : 'rgba(15, 23, 42, 0.26)'
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        // Redirect runs backward (right-to-left). Binding it to the left-source / right-target
        // anchors makes it leave the Auth node on the left and enter the Client on the right,
        // so the bezier curves tightly through the open band instead of looping around to the
        // right and covering other nodes. All other edges use the default left/right handles.
        sourceHandle: isRedirect ? 'redirect-source' : undefined,
        targetHandle: isRedirect ? 'redirect-target' : undefined,
        // Redirect is the human-in-the-loop hop: a curved bezier to stand out from the rigid
        // orthogonal API/relation edges. Parallel edges (multiple calls to the same server) use
        // the custom fanned edge so they don't stack. Everything else stays smoothstep.
        type: isRedirect ? 'default' : isParallel ? 'parallel' : 'smoothstep',
        data: isParallel ? { offset: parallelOffset } : undefined,
        label: decorateEdgeLabel(edge.kind, edge.label),
        className: isActive ? 'edge-flow-active' : undefined,
        markerEnd: isRelation
          ? undefined
          : {
              // Creation uses an open arrowhead (resource coming into existence); all other
              // directed edges use a solid closed arrow.
              type: isCreation ? MarkerType.Arrow : MarkerType.ArrowClosed,
              width: 20,
              height: 20,
              color: strokeColor,
            },
        animated: isRedirect || isActive,
        style: {
          strokeWidth: selected ? 3 : isRelation ? 1 : isCreation ? 1.5 : isResponse ? 1.3 : 1.8,
          stroke: strokeColor,
          strokeDasharray: isRedirect ? '5 5' : isCreation ? '4 4' : isRelation ? '1 5' : isResponse ? '2 6' : undefined,
          opacity: focus && !selected ? 0.55 : 1,
        },
        // Structural relations recede (small, muted); creation labels are emphasised.
        labelStyle: isRelation
          ? { fill: 'rgba(11, 18, 32, 0.5)', fontSize: 10 }
          : { fill: 'rgba(11, 18, 32, 0.72)', fontSize: 12, fontWeight: isCreation ? 700 : 400 },
      }
    })

    return { nodes: n as any, edges: e as any }
  }, [flow, focusNodeIds, focusEdgeIds, focus, statusesByStepId])

  useAutoFitOnFocus(focus)

  function clearTimer() {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }

  // Timeline click: moves BOTH the timeline highlight and the explanation/focus.
  // A manual click pins the selection so auto-follow won't override it mid-run.
  function selectStep(id: string) {
    userPinnedRef.current = true
    setSelectedStepId(id)
    setSelection({ kind: 'step', id })
  }

  function appendEvent(e: RunnerEvent) {
    // Ignore duplicates: the runner replays the current run's buffer to every new SSE
    // connection, so a reconnect (without a page reload) could re-deliver events we already
    // have. Event ids are unique, so de-dupe on them.
    setEvents((prev) => (prev.some((x) => x.id === e.id) ? prev : [...prev, e]))
    if (e.type === 'run.completed' || e.type === 'runner.error') {
      setIsRunning(false)
      setIsPaused(false)
      isPausedRef.current = false
    }
    if (e.stepId) {
      const sid = e.stepId
      // Until the user clicks something, follow the running step in the timeline +
      // explanation panel. Once they pin a selection, leave it alone.
      if (!userPinnedRef.current) {
        setSelectedStepId(sid)
        setSelection({ kind: 'step', id: sid })
      }
    }
  }

  function connectToRunner() {
    if (transport === 'mock') return
    setConnected('disconnected')
    const client = createRunnerClient(baseUrl)
    clientRef.current = client
    client.connect({
      onConnected: () => setConnected('connected'),
      onDisconnected: () => setConnected('disconnected'),
      onEvent: (e) => appendEvent(e),
    })
  }

  function disconnectFromRunner() {
    clientRef.current?.disconnect()
    clientRef.current = null
    setConnected('disconnected')
  }

  async function startRun() {
    if (isRunning) return
    setEvents([])
    setIsPaused(false)
    isPausedRef.current = false
    // Re-arm auto-follow: a fresh run should track the running step until the user clicks.
    userPinnedRef.current = false
    clearTimer()

    if (transport === 'mock') {
      setIsRunning(true)
      playbackRef.current = { queue: makeMockRunEvents(effectiveSpec, 'https://example.com/consent'), i: 0 }
      pumpPlayback()
      return
    }

    const missing: string[] = []
    if (!keyId.trim()) missing.push('Key ID')
    if (!privateKeyPath.trim()) missing.push('Private key path')
    if (!clientWalletAddressUrl.trim()) missing.push('Client wallet address')
    if (!sendingWalletAddressUrl.trim()) missing.push('Sending wallet address')
    if (!receivingWalletAddressUrl.trim()) missing.push('Receiving wallet address')

    if (missing.length) {
      const credMissing = missing.some((m) => m.includes('Key') || m.includes('Private'))
      setBottomTab('setup')
      // Expand the relevant config section so the missing fields are visible.
      setOpenSections((s) => ({ ...s, credentials: s.credentials || credMissing, addresses: s.addresses || !credMissing }))
      showToast(
        'TestNet setup needed',
        `Running on the Interledger TestNet needs your credentials and wallet addresses. Fill them in under the Configuration tab. Still missing: ${missing.join(', ')}.`
      )
      appendEvent({
        id: crypto.randomUUID(),
        runId: 'local',
        ts: new Date().toISOString(),
        type: 'runner.error',
        level: 'error',
        message: `Missing required fields: ${missing.join(', ')}.`,
      })
      return
    }

    if (!clientRef.current) connectToRunner()
    const config: RunnerConfig = {
      keyId,
      privateKeyPath: stripWrappingQuotes(privateKeyPath),
      clientWalletAddressUrl: normalizeWalletAddressInput(clientWalletAddressUrl),
      sendingWalletAddressUrl: normalizeWalletAddressInput(sendingWalletAddressUrl),
      receivingWalletAddressUrl: normalizeWalletAddressInput(receivingWalletAddressUrl),
      callbackPort,
      scenarioId,
      uiBaseUrl,
      // Parameter-editor edits; the runner merges these onto the registered spec.
      specOverrides: toSpecOverrides(effectiveSpec),
    }
    setIsRunning(true)
    try {
      await clientRef.current?.startRun(config)
    } catch (err) {
      setIsRunning(false)
      const message = err instanceof Error ? err.message : String(err)
      appendEvent({
        id: crypto.randomUUID(),
        runId: 'local',
        ts: new Date().toISOString(),
        type: 'runner.error',
        level: 'error',
        message: `Failed to start run: ${message}`,
      })
    }
  }

  function openConsent() {
    const url = lastRedirectUrl
    if (!url) return

    if (transport === 'mock') {
      // Mock mode has no real auth server to visit — don't open an external tab. Just simulate
      // the user approving and the runner continuing the grant.
      clearTimer()
      playbackRef.current = { queue: makeMockConsentCompletionEvents(effectiveSpec), i: 0 }
      pumpPlayback()
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function togglePause() {
    const next = !isPaused
    setIsPaused(next)
    isPausedRef.current = next
    if (transport === 'mock') {
      if (!next) pumpPlayback() // resuming: restart the loop from where it stopped
    } else {
      await (next ? clientRef.current?.pause() : clientRef.current?.resume())
    }
  }

  useEffect(() => {
    if (transport === 'mock') {
      disconnectFromRunner()
      return
    }
    connectToRunner()
    return () => disconnectFromRunner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, baseUrl])

  // Listen for the consent tab signaling that the user completed the interaction.
  // The runner continues the grant automatically; this just surfaces an acknowledgment.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('opviz.consent')
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'consent-complete') setConsentAck(true)
    }
    return () => bc.close()
  }, [])

  // Once new events arrive after consent (e.g. grant.continued), clear the acknowledgment.
  useEffect(() => {
    if (consentState.needsConsent) setConsentAck(false)
  }, [consentState.needsConsent])

  const consentEnabled = Boolean(lastRedirectUrl)

  return (
    <div className="app">
      <header className="brandbar">
        <div className="brand">
          <span className="brandMark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 8 L21 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M7 20 L21 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="7" cy="8" r="3.5" fill="var(--uctBlue)" />
              <circle cx="7" cy="20" r="3.5" fill="var(--uctBlue)" />
              <circle cx="21" cy="14" r="4" fill="var(--uctGold)" />
            </svg>
          </span>
          <div className="brandText">
            <span className="brandTitle">
              Open Payments <span className="brandAccent">Visualizer</span>
            </span>
          </div>
        </div>
      </header>

      <div className="topbar">
        <div className="left">
          <div className="field" style={{ width: 160, minWidth: 160, flex: 'none' }}>
            <label>Method</label>
            <select
              style={{ width: '100%' }}
              value={transport}
              onChange={(e) => setTransport(e.target.value as TransportMode)}
              disabled={mockOnly}
              title={mockOnly ? 'This scenario runs in Mocked mode only' : undefined}
            >
              <option value="mock">Mocked</option>
              <option value="sse" disabled={mockOnly}>
                Interledger TestNet
              </option>
            </select>
          </div>

          <div className="field" style={{ minWidth: 200 }}>
            <label>Scenario</label>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="center">
          <div className="btnRow">
            <button className={`btn primary${isRunning ? ' running' : ''}`} onClick={startRun} disabled={isRunning}>
              <span className="btnIcon" aria-hidden="true">▶</span> Start
            </button>
            <button
              className={`btn secondary${consentState.needsConsent && consentEnabled ? ' consentNeeded' : ''}`}
              onClick={openConsent}
              disabled={!isRunning || !consentEnabled}
            >
              <span className="btnIcon" aria-hidden="true">↗</span> Consent
            </button>
            <button
              className={`btn ${isPaused ? 'gold' : 'secondary'}`}
              onClick={togglePause}
              disabled={!isRunning}
            >
              <span className="btnIcon" aria-hidden="true">{isPaused ? '▶' : '⏸'}</span> {isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>

          {transport === 'mock' ? (
            <div className="speed">
              <span className="speedLabel">Speed</span>
              <div className="speedPresets">
                {[0.1, 0.25, 0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    className={`speedPreset ${speed === s ? 'active' : ''}`}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Absolutely positioned so it sits just right of the speed control without reflowing
              the buttons/speed — keeps the topbar layout identical across scenarios. */}
          {mockOnly ? (
            <div className="mockOnlyNote" role="note">
              <span className="mockOnlyBadge">Mocked only</span>
              <span className="mockOnlyText">
                {flow.mockOnlyReason ?? 'This scenario is illustrative and can’t run against the live TestNet.'}
              </span>
            </div>
          ) : null}
        </div>

        <div className="right">
          <button
            className="iconBtn helpBtn"
            title="Help / orientation"
            aria-label="Help / orientation"
            onClick={() => setIntroOpen(true)}
          >
            ?
          </button>
          <div className="badge">
            <span className={`dot ${connected === 'connected' || transport === 'mock' ? 'ok' : 'bad'}`} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <div style={{ fontWeight: 650, fontSize: 13 }}>Runner</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {transport === 'mock' ? 'mock events' : connected}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`layout ${timelineCollapsed ? 'timeline-collapsed' : ''} ${narrationCollapsed ? 'narration-collapsed' : ''}`}>
        {timelineCollapsed ? (
          <div className="panel collapsedRail">
            <button className="railToggle" title="Show timeline" onClick={() => setTimelineCollapsed(false)}>
              <span className="railLabel">Timeline</span>
              <span className="railShow">Show</span>
            </button>
          </div>
        ) : (
        <div className="panel">
          <div className="panelHeader">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2>Timeline</h2>
              <button className="tab active" onClick={() => setTimelineCollapsed(true)}>
                Hide
              </button>
            </div>
          </div>
          <div className="panelBody">
            <div className="timeline">
              {flow.steps.map((step, idx) => {
                const st = statusesByStepId[step.id] ?? 'idle'
                const prevGroup = idx > 0 ? flow.steps[idx - 1]?.group : undefined
                const showGroup = step.group && step.group !== prevGroup
                return (
                  <React.Fragment key={step.id}>
                    {showGroup ? <div className="timelineGroup">{step.group}</div> : null}
                    <div
                      className={`step ${selectedStepId === step.id ? 'selected' : ''}`}
                      onClick={() => selectStep(step.id)}
                    >
                      <div className="title">
                        <div>{step.title}</div>
                        <div key={st} className={pillClass(st)}>{st}</div>
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}
            </div>
            </div>
        </div>
        )}

        <div
          className="centerCol"
          ref={centerColRef}
          style={{ gridTemplateRows: `minmax(120px, 1fr) 10px ${Math.round(controlsHeight)}px` }}
        >
          <div className="panel">
            <div className="panelHeader">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h2>Flow</h2>
                <button
                  className={`tab ${legendOpen ? 'active' : ''}`}
                  onClick={() => setLegendOpen((v) => !v)}
                  aria-pressed={legendOpen}
                >
                  {legendOpen ? 'Hide legend' : 'Legend'}
                </button>
              </div>
            </div>
            <div className="flowWrap">
              {legendOpen ? <LegendOverlay onClose={() => setLegendOpen(false)} /> : null}
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                onNodeClick={(_, n) => {
                  userPinnedRef.current = true
                  setSelection({ kind: 'node', id: String(n.id) })
                }}
                onEdgeClick={(_, ed) => {
                  userPinnedRef.current = true
                  setSelection({ kind: 'edge', id: String(ed.id) })
                }}
              >
                <Background color="rgba(0,0,0,0.06)" gap={24} />
              </ReactFlow>
            </div>
          </div>

          <div
            className="rowResizer"
            role="separator"
            aria-orientation="horizontal"
            title="Drag to resize"
            onMouseDown={startControlsResize}
            onDoubleClick={toggleMaximizeControls}
          >
            <span className="rowResizerGrip" />
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h2>Scenario Controls</h2>
                <div className="tabBar">
                  <button className={`tab ${bottomTab === 'inspector' ? 'active' : ''}`} onClick={() => setBottomTab('inspector')}>
                    Event Logs
                  </button>
                  <button className={`tab ${bottomTab === 'description' ? 'active' : ''}`} onClick={() => setBottomTab('description')}>
                    Scenario Description
                  </button>
                  <button className={`tab ${bottomTab === 'params' ? 'active' : ''}`} onClick={() => setBottomTab('params')}>
                    Parameters
                  </button>
                  <button className={`tab ${bottomTab === 'setup' ? 'active' : ''}`} onClick={() => setBottomTab('setup')}>
                    Configuration
                  </button>
                  <button
                    className="iconBtn maximizeBtn"
                    title={controlsMaximized ? 'Restore' : 'Maximize'}
                    aria-label={controlsMaximized ? 'Restore panel' : 'Maximize panel'}
                    aria-pressed={controlsMaximized}
                    onClick={toggleMaximizeControls}
                  >
                    {controlsMaximized ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="4 14 10 14 10 20" />
                        <polyline points="20 10 14 10 14 4" />
                        <line x1="14" y1="10" x2="21" y2="3" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="panelBody">
              {bottomTab === 'inspector' ? (
                <EventLog
                  events={events}
                  flow={flow}
                  onSelectStep={selectStep}
                  selectedStepId={selectedStepId}
                  amounts={runAmounts}
                />
              ) : bottomTab === 'description' ? (
                <ScenarioDescription flow={flow} amounts={specAmounts} failure={effectiveSpec.mockFailure} />
              ) : bottomTab === 'params' ? (
                <div className="configForm">
                  {params ? (
                    <ParameterEditor
                      spec={getExecutionSpec(scenarioId)}
                      params={params}
                      onChange={setParams}
                      onReset={() => setParams(deriveParams(getExecutionSpec(scenarioId)))}
                      transport={transport}
                      disabled={isRunning}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="configForm">
                  <CollapsibleCard
                    title="Configuration"
                    hint="Save/load your setup for later"
                    open={openSections.scenario}
                    onToggle={() => setOpenSections((s) => ({ ...s, scenario: !s.scenario }))}
                  >
                    <div className="field">
                      <label>Select Configuration</label>
                      <div className="scenarioRow">
                        <select
                          value={selectedScenario}
                          onChange={(e) => {
                            const id = e.target.value
                            setSelectedScenario(id)
                            const sc = savedScenarios.find((s) => s.id === id)
                            if (sc) applyScenario(sc)
                            else setScenarioName('')
                          }}
                        >
                          <option value="">(new, unsaved)</option>
                          {savedScenarios.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <span className={`pill ${selectedScenario ? 'ok' : ''}`}>
                          {selectedScenario
                            ? `Editing: ${savedScenarios.find((s) => s.id === selectedScenario)?.name ?? '—'}`
                            : 'Unsaved (new)'}
                        </span>
                      </div>
                    </div>

                    <div className="field">
                      <label>Configuration Name</label>
                      <input
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        placeholder="e.g. USD → EUR test"
                      />
                    </div>

                    <div className="btnRow scenarioActions">
                      <button className="btn" onClick={saveScenario}>
                        {selectedScenario ? 'Save' : 'Save Configuration'}
                      </button>
                      <button className="btn secondary" onClick={saveScenarioAsNew}>
                        Save as new
                      </button>
                      <button className="btn secondary" onClick={duplicateScenario} disabled={!selectedScenario}>
                        Duplicate
                      </button>
                      <button className="btn danger" onClick={deleteScenario} disabled={!selectedScenario}>
                        Delete
                      </button>
                    </div>
                    <div className="subtleHelp">
                      Saves your addresses + Key ID. Does <strong>not</strong> save private key contents.
                    </div>
                  </CollapsibleCard>

                  <CollapsibleCard
                    title="Credentials"
                    hint="Client Credentials"
                    open={openSections.credentials}
                    onToggle={() => setOpenSections((s) => ({ ...s, credentials: !s.credentials }))}
                  >
                    <div className="hint">
                      No credentials yet? Create a free account and key pair at the{' '}
                      <a
                        href="https://wallet.interledger-test.dev/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Interledger Test Wallet
                      </a>
                      . TestNet wallets carry no real money.
                    </div>
                    <div className="grid2">
                      <div className="field">
                        <label>Key ID</label>
                        <input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="Key ID from Test Wallet" />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>Private key path</label>
                        <input value={privateKeyPath} onChange={(e) => setPrivateKeyPath(stripWrappingQuotes(e.target.value))} placeholder="C:\\Users\\...\\USD_KEY.key" />
                      </div>
                    </div>
                    <div className="hint">
                      We need the full path to your private key (the <span className="mono">.key</span>{' '}
                      file) on this computer (the <strong>absolute path</strong>).
                      <br />
                       <strong>Windows</strong>: Shift + right-click the file →
                      “Copy as path”. <strong><br/>macOS</strong>: right-click, then hold Option →
                      “Copy … as Pathname”.
                    </div>
                  </CollapsibleCard>

                  <CollapsibleCard
                    title="Wallet Addresses"
                    hint="ILP wallet addresses"
                    open={openSections.addresses}
                    onToggle={() => setOpenSections((s) => ({ ...s, addresses: !s.addresses }))}
                  >
                    <div className="grid2">
                      <div className="field">
                        <label>Client wallet address</label>
                        <input value={clientWalletAddressUrl} onChange={(e) => setClientWalletAddressUrl(e.target.value)} placeholder="$ilp.interledger-test.dev/usdtest" />
                        <AddressPreview value={clientWalletAddressUrl} />
                        <WalletBadge value={clientWalletAddressUrl} baseUrl={baseUrl} />
                      </div>
                      <div className="field">
                        <label>Sending wallet address</label>
                        <input value={sendingWalletAddressUrl} onChange={(e) => setSendingWalletAddressUrl(e.target.value)} placeholder="$ilp.interledger-test.dev/usdtest" />
                        <AddressPreview value={sendingWalletAddressUrl} />
                        <WalletBadge value={sendingWalletAddressUrl} baseUrl={baseUrl} />
                      </div>
                      <div className="field" style={{ gridColumn: '1 / -1' }}>
                        <label>Receiving wallet address</label>
                        <input value={receivingWalletAddressUrl} onChange={(e) => setReceivingWalletAddressUrl(e.target.value)} placeholder="$ilp.interledger-test.dev/a23bbe02" />
                        <AddressPreview value={receivingWalletAddressUrl} />
                        <WalletBadge value={receivingWalletAddressUrl} baseUrl={baseUrl} />
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>
              )}
            </div>
          </div>
        </div>

        {narrationCollapsed ? (
          <div className="panel collapsedRail">
            <button className="railToggle" title="Show flow narration" onClick={() => setNarrationCollapsed(false)}>
              <span className="railLabel">Flow narration</span>
              <span className="railShow">Show</span>
            </button>
          </div>
        ) : (
        <div className="panel">
          <div className="panelHeader">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2>Flow narration</h2>
              <button className="tab active" onClick={() => setNarrationCollapsed(true)}>
                Hide
              </button>
            </div>
          </div>
          <div className="panelBody">
            <div className="narration">
              <div className="narrHead">
                <div className="narrTitle" style={{ color: `var(${focusHeader.colorVar})` }}>
                  {focusHeader.title}
                </div>
                {focusHeader.badge ? (
                  <span
                    className="narrBadge"
                    style={{ color: `var(${focusHeader.colorVar})`, borderColor: `var(${focusHeader.colorVar})` }}
                  >
                    {focusHeader.badge}
                  </span>
                ) : null}
              </div>
              <QuoteBreakdown amounts={runAmounts} />
              <div className="narrBody">
                {narration.map((seg, i) => (
                  <div className="narrSection" key={i}>
                    {seg.label ? <div className="narrLabel">{seg.label}</div> : null}
                    <NarrationParagraph text={seg.body} />
                  </div>
                ))}
              </div>
              {consentAck ? (
                <div className="hint ok">
                  ✓ Consent received from the other tab. The runner is continuing the grant automatically.
                </div>
              ) : consentState.needsConsent && consentEnabled ? (
                <div className="hint">
                  Consent is required. Use <strong>Consent</strong> to open the redirect and approve — the run continues
                  automatically once you’re back.
                </div>
              ) : null}
            </div>
          </div>
        </div>
        )}
      </div>

      {introOpen ? <IntroDialog onClose={dismissIntro} /> : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          <div className="toastBody">
            <div className="toastTitle">{toast.title}</div>
            <div className="toastText">{toast.body}</div>
          </div>
          <button type="button" className="toastClose" aria-label="Dismiss" onClick={dismissToast}>
            ✕
          </button>
        </div>
      ) : null}
    </div>
  )
}

// Standalone view shown when the auth server (via the runner's callback) redirects
// the consent tab back to the UI with `?consent=ok&runId=...`. It signals the original
// visualizer tab that consent completed, then invites the user to return.
function ConsentReturn({ runId }: { runId?: string }) {
  useEffect(() => {
    try {
      const bc = new BroadcastChannel('opviz.consent')
      bc.postMessage({ type: 'consent-complete', runId })
      bc.close()
    } catch {
      // BroadcastChannel unsupported — fall back to a storage event below.
    }
    try {
      localStorage.setItem('opviz.consent.lastComplete', JSON.stringify({ runId: runId ?? null, at: Date.now() }))
    } catch {
      // ignore
    }
    // Clear the consent params so a refresh of this tab doesn't re-trigger anything.
    try {
      window.history.replaceState({}, '', window.location.pathname)
    } catch {
      // ignore
    }
  }, [runId])

  return (
    <div className="consentReturn">
      <div className="consentCard">
        <div className="consentCheck" aria-hidden="true">
          ✓
        </div>
        <h1>Consent received</h1>
        <p>
          Your authorization was captured. The visualizer is continuing the run in your original tab — the outgoing
          payment will be created automatically.
        </p>
        <p className="subtleHelp">You can safely close this tab and return to the OpenPayments visualizer.</p>
        <button
          className="btn"
          onClick={() => {
            window.close()
          }}
        >
          Close this tab
        </button>
      </div>
    </div>
  )
}

export function App() {
  const consentParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  if (consentParams.get('consent') === 'ok') {
    return <ConsentReturn runId={consentParams.get('runId') ?? undefined} />
  }

  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}

