import { getStepStatusFromEvents, type CapturedHttp, type FlowDefinition, type RunnerEvent, type StepStatus } from '@opviz/shared'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RunAmounts } from '../lib/amounts'
import { highlightEntities, type EntityColorVar } from '../lib/colorMap'
import {
  groupEventsIntoBlocks,
  humanizeEvent,
  resolveWhy,
  RUN_LANE_KEY,
  toCuratedLines,
  type EventBlock,
  type WhyContent,
} from '../lib/eventNarration'
import { formatTime, prettyJson } from '../lib/format'
import { HTTP_ANNOTATIONS } from '../lib/httpAnnotations'

type EventLogProps = {
  events: RunnerEvent[]
  flow: FlowDefinition
  // Optional: clicking a block header drives the shared timeline/graph selection.
  onSelectStep?: (stepId: string) => void
  selectedStepId?: string | null
  // Live run amounts, used to fill {tokens} in the per-step "why" prose.
  amounts?: RunAmounts
}

// Keep enough blocks to comfortably cover any scenario; guards against an unbounded live run.
const MAX_BLOCKS = 30

function pillClass(status: StepStatus): string {
  if (status === 'success') return 'pill statusPill ok'
  if (status === 'error') return 'pill statusPill err'
  if (status === 'active') return 'pill statusPill act'
  return 'pill statusPill'
}

function blockKey(block: EventBlock): string {
  return block.stepId ?? RUN_LANE_KEY
}

// Inline entity colouring, identical scheme to the narration panel's NarrationParagraph.
function NarrationSentence({ text }: { text: string }) {
  const parts = useMemo(() => highlightEntities(text), [text])
  return (
    <span className="eventSentence">
      {parts.map((p, idx) =>
        typeof p === 'string' ? (
          <span key={idx}>{p}</span>
        ) : (
          <span key={idx} className="kw" style={{ color: `var(${p.varName})` }}>
            {p.t}
          </span>
        )
      )}
    </span>
  )
}

const WHY_WIDTH = 360

// Rendered in a portal at fixed coordinates anchored to the info icon, so it floats above the
// (clipping, scrolling) log panel. The log lives at the bottom of the screen, so it opens
// upward whenever there's more room above the icon than below.
function WhyTooltip({ why, anchor, onClose }: { why: WhyContent; anchor: DOMRect; onClose: () => void }) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const spaceBelow = window.innerHeight - anchor.bottom
  const spaceAbove = anchor.top
  const openUp = spaceAbove > spaceBelow
  const left = Math.max(8, Math.min(anchor.right - WHY_WIDTH, window.innerWidth - WHY_WIDTH - 8))
  const style: React.CSSProperties = openUp
    ? { left, bottom: window.innerHeight - anchor.top + 6, maxHeight: spaceAbove - 16 }
    : { left, top: anchor.bottom + 6, maxHeight: spaceBelow - 16 }

  return createPortal(
    <div
      className="whyTooltip"
      role="dialog"
      aria-label={`Why: ${why.title}`}
      style={style}
      onClick={(ev) => ev.stopPropagation()}
    >
      <h4>Why this happens</h4>
      {why.what && (
        <p className="whyWhat">
          <NarrationSentence text={why.what} />
        </p>
      )}
      {why.roles.length > 0 && (
        <dl className="whyList">
          {why.roles.map((r) => (
            <div key={r.label} className="whyItem">
              <dt>{r.label}</dt>
              <dd>
                <NarrationSentence text={r.body} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {why.edges.length > 0 && (
        <dl className="whyList">
          {why.edges.map((ed) => (
            <div key={ed.label} className="whyItem">
              <dt className="whyEdge">{ed.label}</dt>
              <dd>
                <NarrationSentence text={ed.body} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>,
    document.body
  )
}

function CuratedJson({ event, keyField }: { event: RunnerEvent; keyField?: string }) {
  const [showMeta, setShowMeta] = useState(false)
  const lines = useMemo(() => toCuratedLines(event, keyField), [event, keyField])
  const hasMeta = lines.some((l) => l.boilerplate)

  return (
    <div className="curatedJson">
      {lines
        .filter((l) => showMeta || !l.boilerplate)
        .map((l) => (
          <div
            key={l.key}
            className="jsonLine"
            data-highlight={l.highlight || undefined}
            data-boilerplate={l.boilerplate || undefined}
          >
            <span className="jsonKey">{l.key}</span>
            <span className="jsonSep">: </span>
            {l.value.includes('\n') ? (
              <pre className="jsonVal">{l.value}</pre>
            ) : (
              <span className="jsonVal">{l.value}</span>
            )}
          </div>
        ))}
      {hasMeta && (
        <button type="button" className="metaToggle" onClick={() => setShowMeta((v) => !v)}>
          {showMeta ? 'Hide metadata' : 'Show metadata (id, runId…)'}
        </button>
      )}
    </div>
  )
}

// Maps a URL hostname to a human-readable server label and its entity color var.
function classifyUrl(url: string): { label: string; colorVar: EntityColorVar } {
  try {
    const { hostname } = new URL(url)
    if (/auth\./i.test(hostname)) return { label: 'Auth Server', colorVar: '--entityAuthServer' }
    if (/ilp\.|resource\./i.test(hostname)) return { label: 'Resource Server', colorVar: '--entityResourceServer' }
  } catch {
    // malformed URL — fall through to default
  }
  return { label: 'Server', colorVar: '--accent' }
}

// Renders a parsed JSON value with syntax coloring. Keys get annotation chips when annotate=true.
function renderValue(value: unknown, depth: number, annotate: boolean): ReactNode {
  if (value === null) return <span className="jvNull">null</span>
  if (typeof value === 'boolean') return <span className="jvBool">{String(value)}</span>
  if (typeof value === 'number') return <span className="jvNum">{value}</span>
  if (typeof value === 'string') return <span className="jvStr">"{value}"</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="jvNull">[]</span>
    return (
      <>
        {'['}
        <div className="jvIndent">
          {value.map((item, i) => (
            <span key={i} className="jvLine">
              {renderValue(item, depth + 1, annotate)}
              {i < value.length - 1 ? ',' : ''}
            </span>
          ))}
        </div>
        {']'}
      </>
    )
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span className="jvNull">{'{}'}</span>
    return (
      <>
        {'{'}
        <div className="jvIndent">
          {entries.map(([k, v], i) => (
            <span key={k} className="jvLine">
              <span className="jsonKey">"{k}"</span>
              {annotate && HTTP_ANNOTATIONS[k] ? (
                <span className="jsonAnnotation" title={HTTP_ANNOTATIONS[k]}>{HTTP_ANNOTATIONS[k]}</span>
              ) : null}
              <span className="jsonSep">: </span>
              {renderValue(v, depth + 1, annotate)}
              {i < entries.length - 1 ? ',' : ''}
            </span>
          ))}
        </div>
        {'}'}
      </>
    )
  }
  return <span>{String(value)}</span>
}

// Formatted JSON body with syntax coloring, falling back to raw <pre> if parse fails.
function FormattedJson({ raw, annotate }: { raw: string; annotate: boolean }) {
  const parsed = useMemo(() => {
    try { return { ok: true, value: JSON.parse(raw) } } catch { return { ok: false } }
  }, [raw])

  if (!parsed.ok) return <pre className="rawJson">{raw}</pre>
  return (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6 }}>
      {renderValue(parsed.value, 0, annotate)}
    </div>
  )
}

// The real (TestNet) or synthesized (mock) HTTP behind an event, with secrets already redacted by
// the runner/mock. Structured into server identity → request card → response card.
function HttpDetail({ http, annotate }: { http: CapturedHttp; annotate: boolean }) {
  const [showHeaders, setShowHeaders] = useState(false)
  const headers = http.requestHeaders ? Object.entries(http.requestHeaders) : []
  const server = classifyUrl(http.url)
  const pathOnly = (() => {
    try { const u = new URL(http.url); return u.pathname + u.search } catch { return http.url }
  })()
  const method = http.method.toLowerCase()
  const statusClass = typeof http.status === 'number'
    ? (http.status >= 200 && http.status < 300 ? 'ok' : http.status >= 400 ? 'err' : '')
    : ''

  return (
    <div className="httpDetail">
      {/* Zone A: server identity */}
      <div className="httpServerHeader">
        <span className="httpServerBadge" style={{ color: `var(${server.colorVar})` }}>
          {server.label}
        </span>
        <span className="httpServerUrl">
          <span className="httpServerUrlHost">{(() => { try { return new URL(http.url).hostname } catch { return '' } })()}</span>
          <span className="httpServerUrlPath">{pathOnly.replace(/^[^/]*/, '')}</span>
        </span>
      </div>

      {/* Zone B: request */}
      <div className="httpBlock">
        <div className="httpBlockHead">
          <span className={`httpMethodBadge ${method}`}>{http.method}</span>
          <span className="httpBlockPath">{pathOnly}</span>
          {headers.length > 0 && (
            <button type="button" className="metaToggle" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
              onClick={() => setShowHeaders(v => !v)}>
              {showHeaders ? 'Hide headers' : `Headers (${headers.length})`}
            </button>
          )}
        </div>
        <div className="httpBlockBody">
          {showHeaders && (
            <pre className="rawJson" style={{ marginBottom: 8 }}>
              {headers.map(([k, v]) => `${k}: ${v}`).join('\n')}
            </pre>
          )}
          {http.requestBody
            ? <FormattedJson raw={http.requestBody} annotate={annotate} />
            : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.5 }}>(no body)</span>}
        </div>
      </div>

      {/* Arrow */}
      {(http.status != null || http.responseBody) && <div className="httpArrow">↓</div>}

      {/* Zone C: response */}
      {(http.status != null || http.responseBody) && (
        <div className="httpBlock">
          <div className="httpBlockHead">
            {typeof http.status === 'number' && (
              <span className={`pill statusPill ${statusClass}`} style={{ fontSize: 11 }}>
                {http.status}
              </span>
            )}
          </div>
          <div className="httpBlockBody">
            {http.responseBody
              ? <FormattedJson raw={http.responseBody} annotate={annotate} />
              : <span style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.5 }}>(no body)</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// Manages tab state for an expanded event row. Extracted so hooks run unconditionally.
function EventBody({ event, flow, rawMode }: { event: RunnerEvent; flow: FlowDefinition; rawMode: boolean }) {
  const [tab, setTab] = useState<'event' | 'http'>(() => event.http ? 'http' : 'event')
  const [annotate, setAnnotate] = useState(false)
  const n = humanizeEvent(event, flow)

  if (rawMode) {
    return (
      <div className="eventBody">
        <pre className="rawJson">{prettyJson(event)}</pre>
      </div>
    )
  }

  const hasHttp = Boolean(event.http)

  return (
    <div className="eventBody">
      {hasHttp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div className="eventHttpTabs">
            <button type="button" className={`eventHttpTab ${tab === 'http' ? 'active' : ''}`}
              onClick={() => setTab('http')}>HTTP Call</button>
            <button type="button" className={`eventHttpTab ${tab === 'event' ? 'active' : ''}`}
              onClick={() => setTab('event')}>Event Details</button>
          </div>
          {tab === 'http' && (
            <button type="button" className="httpAnnotateToggle" onClick={() => setAnnotate(v => !v)}>
              {annotate ? 'Hide annotations' : 'Annotate fields'}
            </button>
          )}
        </div>
      )}
      {(!hasHttp || tab === 'event') && (
        <CuratedJson event={event} keyField={n.keyField} />
      )}
      {hasHttp && tab === 'http' && (
        <HttpDetail http={event.http!} annotate={annotate} />
      )}
    </div>
  )
}

export function EventLog({ events, flow, onSelectStep, selectedStepId, amounts }: EventLogProps) {
  const [rawMode, setRawMode] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [openWhy, setOpenWhy] = useState<{ key: string; anchor: DOMRect } | null>(null)

  // Pin the Run lane to the top; show step blocks newest-active-first so the live step stays
  // visible without scrolling. Within a block, events stay in causal (arrival) order.
  const orderedBlocks = useMemo(() => {
    const blocks = groupEventsIntoBlocks(events, flow)
    const runLane = blocks.filter((b) => b.stepId === null)
    const stepBlocks = blocks.filter((b) => b.stepId !== null).reverse()
    return [...runLane, ...stepBlocks].slice(0, MAX_BLOCKS)
  }, [events, flow])

  // Close the why-popover on any click outside the popover or its trigger.
  useEffect(() => {
    if (!openWhy) return
    function onDocClick(ev: MouseEvent) {
      const t = ev.target as HTMLElement | null
      if (t && t.closest('.whyTooltip, .whyIcon')) return
      setOpenWhy(null)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [openWhy])

  function toggleEvent(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (events.length === 0) {
    return (
      <div className="eventLog">
        <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
          Run a scenario to generate events.
        </div>
      </div>
    )
  }

  let prevGroup: string | undefined

  return (
    <div className="eventLog">
      <div className="eventLogHeader">
        <span className="eventLogCount">{events.length} events</span>
        <label className="rawToggle">
          <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)} />
          Developer / raw
        </label>
      </div>

      {orderedBlocks.map((block) => {
        const key = blockKey(block)
        const status = block.stepId ? getStepStatusFromEvents(block.stepId, events) : undefined
        const why = resolveWhy(block, flow, amounts)
        const clickable = Boolean(block.stepId && onSelectStep)
        const showGroupLabel = block.group && block.group !== prevGroup
        prevGroup = block.group

        return (
          <div key={key}>
            {showGroupLabel && <div className="eventGroupLabel">{block.group}</div>}
            <section
              className="eventBlock"
              data-status={status}
              aria-current={block.stepId != null && selectedStepId === block.stepId ? 'step' : undefined}
            >
              <header
                className="eventBlockHead"
                data-clickable={clickable || undefined}
                onClick={clickable ? () => onSelectStep!(block.stepId!) : undefined}
              >
                <span className="branchDot" data-status={status} />
                <h3 className="eventBlockTitle">{block.title}</h3>
                {status && <span key={status} className={pillClass(status)}>{status}</span>}
                {why && (
                  <span className="whyWrap">
                    <button
                      type="button"
                      className="whyIcon"
                      aria-label="Why this happens"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        const anchor = ev.currentTarget.getBoundingClientRect()
                        setOpenWhy((cur) => (cur?.key === key ? null : { key, anchor }))
                      }}
                    >
                      i
                    </button>
                    {openWhy?.key === key && (
                      <WhyTooltip why={why} anchor={openWhy.anchor} onClose={() => setOpenWhy(null)} />
                    )}
                  </span>
                )}
              </header>

              <ol className="eventBranch">
                {block.events.map((e) => {
                  const n = humanizeEvent(e, flow)
                  const isOpen = expanded.has(e.id)
                  return (
                    <li className="eventNode" data-type={e.type} key={e.id}>
                      <span className="branchMarker" style={{ ['--dot' as string]: `var(${n.actorColorVar})` }} />
                      <button
                        type="button"
                        className="eventSummary"
                        aria-expanded={isOpen}
                        data-icon={n.icon}
                        onClick={() => toggleEvent(e.id)}
                      >
                        <span className="eventSummaryMain">
                          <NarrationSentence text={n.sentence} />
                          {n.facts && n.facts.length > 0 && (
                            <span className="eventFacts">
                              {n.facts.map((f) => (
                                <span key={f.label} className="eventFact">
                                  <span className="eventFactLabel">{f.label}</span>
                                  <code className="eventFactVal" data-tone={f.tone}>
                                    {f.value}
                                  </code>
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                        <time className="eventTime">{formatTime(e.ts)}</time>
                      </button>
                      {isOpen && <EventBody event={e} flow={flow} rawMode={rawMode} />}
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>
        )
      })}
    </div>
  )
}
