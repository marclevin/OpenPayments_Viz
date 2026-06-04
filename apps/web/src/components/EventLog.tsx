import { getStepStatusFromEvents, type FlowDefinition, type RunnerEvent, type StepStatus } from '@opviz/shared'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { highlightEntities } from '../lib/colorMap'
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

type EventLogProps = {
  events: RunnerEvent[]
  flow: FlowDefinition
  // Optional: clicking a block header drives the shared timeline/graph selection.
  onSelectStep?: (stepId: string) => void
  selectedStepId?: string | null
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

export function EventLog({ events, flow, onSelectStep, selectedStepId }: EventLogProps) {
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
        const why = resolveWhy(block, flow)
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
                      {isOpen && (
                        <div className="eventBody">
                          {rawMode ? (
                            <pre className="rawJson">{prettyJson(e)}</pre>
                          ) : (
                            <CuratedJson event={e} keyField={n.keyField} />
                          )}
                        </div>
                      )}
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
