// A dismissible reference card pinned over the Flow graph. It documents the graph's stable
// visual vocabulary so a first-time student can decode it: node-kind glyphs + shapes, the five
// edge kinds (glyph / line style / arrowhead), and the four status colours. The glyphs and
// colours here mirror FlowNode.tsx (kindGlyph), App.tsx (edgeKindGlyph + edge styling), and the
// status colours used across the app — keep them in sync if those change.

// Node kinds: glyph + one-line meaning. Shapes (agent vs resource) are explained in the section
// note below, matching FlowNode's agentKinds split.
const NODE_ENTRIES: Array<{ glyph: string; label: string; meaning: string }> = [
  { glyph: '◻', label: 'Client', meaning: 'The program driving the flow — signs and sends every request.' },
  { glyph: '⧉', label: 'Wallet address', meaning: 'A public URL identifying an account; reveals its servers and currency.' },
  { glyph: '⊚', label: 'Auth Server', meaning: 'Grants permission (GNAP) and issues access tokens.' },
  { glyph: '◈', label: 'Resource Server', meaning: "The wallet's API, where resources are created." },
  { glyph: '⇣', label: 'Incoming payment', meaning: 'A destination resource expecting money.' },
  { glyph: '≋', label: 'Quote', meaning: 'A firm price for delivering a payment.' },
  { glyph: '⇡', label: 'Outgoing payment', meaning: 'An instruction to pay (settled out of band).' },
]

// One swatch per edge kind. `dash` matches the strokeDasharray used in App.tsx; `arrow` selects
// the marker drawn at the line's end. Colours reference the same CSS tokens / rgba values.
type EdgeArrow = 'closed' | 'open' | 'none'
const EDGE_ENTRIES: Array<{
  glyph?: string
  label: string
  meaning: string
  color: string
  dash?: string
  arrow: EdgeArrow
}> = [
  { glyph: '⚡', label: 'Request', meaning: 'A network/API call.', color: 'rgba(0, 59, 92, 0.7)', arrow: 'closed' },
  { glyph: '⊕', label: 'Creation', meaning: 'A resource coming into existence.', color: 'rgba(16, 122, 87, 0.85)', dash: '4 4', arrow: 'open' },
  { glyph: '↪', label: 'Redirect (consent)', meaning: 'The human-in-the-loop approval hop.', color: 'var(--edgeRedirect)', dash: '5 5', arrow: 'closed' },
  { label: 'Response', meaning: 'Data returned from a call.', color: 'rgba(15, 23, 42, 0.45)', dash: '2 6', arrow: 'closed' },
]

const STATUS_ENTRIES: Array<{ label: string; color: string; meaning: string }> = [
  { label: 'Idle', color: 'rgba(15,23,42,0.18)', meaning: "Hasn't run yet." },
  { label: 'Active', color: 'var(--statusActive)', meaning: 'In progress right now.' },
  { label: 'Success', color: 'var(--statusOk)', meaning: 'Completed successfully.' },
  { label: 'Error', color: 'var(--statusError)', meaning: 'Failed — check the event log.' },
]

function EdgeSwatch({ color, dash, arrow }: { color: string; dash?: string; arrow: EdgeArrow }) {
  return (
    <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true" className="legendEdgeSwatch">
      <line
        x1="2"
        y1="7"
        x2={arrow === 'none' ? 38 : 30}
        y2="7"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dash}
        strokeLinecap="round"
      />
      {arrow === 'closed' && <path d="M30 3 L38 7 L30 11 Z" fill={color} />}
      {arrow === 'open' && (
        <path d="M31 3 L38 7 L31 11" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

export function LegendOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="legendOverlay" role="dialog" aria-label="Graph legend">
      <div className="legendHead">
        <h3>Legend</h3>
        <button type="button" className="legendClose" aria-label="Hide legend" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="legendSection">
        <div className="legendSectionLabel">Components</div>
        <div className="legendSectionNote">
          Sharp-cornered boxes <em>act</em> (Client, servers); rounded pills are <em>resources</em> that are read or created.
        </div>
        <ul className="legendList">
          {NODE_ENTRIES.map((e) => (
            <li key={e.label} className="legendItem">
              <span className="legendGlyph" aria-hidden="true">{e.glyph}</span>
              <span className="legendText">
                <span className="legendItemLabel">{e.label}</span>
                <span className="legendItemMeaning">{e.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="legendSection">
        <div className="legendSectionLabel">Connections</div>
        <ul className="legendList">
          {EDGE_ENTRIES.map((e) => (
            <li key={e.label} className="legendItem">
              <span className="legendSwatchCell" aria-hidden="true">
                <EdgeSwatch color={e.color} dash={e.dash} arrow={e.arrow} />
              </span>
              <span className="legendText">
                <span className="legendItemLabel">
                  {e.glyph ? <span className="legendInlineGlyph">{e.glyph} </span> : null}
                  {e.label}
                </span>
                <span className="legendItemMeaning">{e.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="legendSection">
        <div className="legendSectionLabel">Status</div>
        <ul className="legendList legendStatusList">
          {STATUS_ENTRIES.map((e) => (
            <li key={e.label} className="legendItem">
              <span className="legendStatusDot" style={{ background: e.color, boxShadow: `0 0 10px ${e.color}` }} aria-hidden="true" />
              <span className="legendText">
                <span className="legendItemLabel">{e.label}</span>
                <span className="legendItemMeaning">{e.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
