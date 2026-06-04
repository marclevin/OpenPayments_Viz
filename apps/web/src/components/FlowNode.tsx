import type { StepStatus } from '@opviz/shared'
import { Handle, Position, type NodeProps } from 'reactflow'
import { getEntityColorVar, getSideAccentVar } from '../lib/colorMap'

type FlowNodeData = {
  label: string
  kind: string
  status?: StepStatus
  selected?: boolean
}

// Active agents are the engines that drive the flow (they act); everything else is a passive
// resource being read or created (it is acted upon). They get distinct shapes so a student can
// tell at a glance what runs the process vs. what is data.
const agentKinds = new Set(['client', 'authServer', 'resourceServer', 'idp'])

const kindGlyph: Record<string, string> = {
  client: '◻',
  walletAddress: '⧉',
  authServer: '⊚',
  resourceServer: '◈',
  idp: '◎',
  grant: '⟡',
  incomingPayment: '⇣',
  quote: '≋',
  outgoingPayment: '⇡',
  generic: '●',
}

function statusColor(status?: StepStatus) {
  if (!status) return 'rgba(255,255,255,0.12)'
  if (status === 'success') return 'rgba(31, 157, 85, 0.40)'
  if (status === 'error') return 'rgba(214, 69, 69, 0.40)'
  if (status === 'active') return 'rgba(183, 121, 31, 0.45)'
  return 'rgba(255,255,255,0.12)'
}

const handleStyle = {
  width: 7,
  height: 7,
  border: '1px solid rgba(255,255,255,0.9)',
  background: 'rgba(15,23,42,0.35)',
}

// Invisible anchor handles used only by the redirect edge so it can leave a node on its left
// and enter on its right — giving a tight return curve instead of the big right-side loop the
// default left/right handles would force. opacity:0 keeps them off-screen; edges bind by id.
const hiddenHandleStyle = { ...handleStyle, opacity: 0, pointerEvents: 'none' as const }

export function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const entityVar = getEntityColorVar(data.label, data.kind)
  const entityColor = `var(${entityVar})`
  const isAgent = agentKinds.has(data.kind)
  // Resources carry a side-accent stripe (warm = sender side, teal = receiver side); fall back
  // to the entity colour when the resource isn't side-specific.
  const accentVar = getSideAccentVar(data.label)
  const accentColor = accentVar ? `var(${accentVar})` : entityColor
  // Agents read as sharp, heavy-bordered "engine" boxes; resources as soft pills with a side stripe.
  const shapeStyle = isAgent
    ? {
        borderRadius: 8,
        borderStyle: 'solid' as const,
        borderColor: entityColor,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
      }
    : {
        borderRadius: 22,
        borderStyle: 'solid' as const,
        borderColor: 'rgba(15,23,42,0.16)',
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 5,
        borderLeftColor: accentColor,
      }
  return (
    <div
      className={`flowNodeCard status-${data.status ?? 'idle'}${data.selected ? ' is-selected' : ''}`}
      style={{
        // Shape (radius + border) is driven by whether this is an active agent or a passive
        // resource — see shapeStyle above.
        ...shapeStyle,
        background: 'rgba(255,255,255,0.94)',
        overflow: 'hidden',
        minWidth: 168,
        // The pulse/settle keyframes and selected glow live in styles.css so an inline
        // box-shadow doesn't override the animation. Expose the entity color for the ring.
        ['--entityColor' as any]: entityColor,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 12px',
          // Soft tint of the entity color behind the label/glyph.
          background: `color-mix(in srgb, ${entityColor} 12%, transparent)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              border: `1px solid color-mix(in srgb, ${entityColor} 45%, transparent)`,
              background: `color-mix(in srgb, ${entityColor} 18%, white)`,
              color: entityColor,
              fontFamily: 'var(--mono)',
              fontSize: 14,
            }}
          >
            {kindGlyph[data.kind] ?? kindGlyph.generic}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'rgba(11,18,32,0.92)' }}>{data.label}</div>
        </div>
        <div
          title={data.status ?? 'idle'}
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: statusColor(data.status),
            boxShadow: `0 0 18px ${statusColor(data.status)}`,
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} style={handleStyle} />
      {/*
        Redirect-only anchors: a source on the left and a target on the right, so the redirect
        edge can leave a node on its left and enter on its right (tight return curve). These are
        declared LAST on purpose — React Flow binds an edge with no explicit handle to the FIRST
        source/target in DOM order, so the default left-target / right-source above must come
        first or every edge would snap to these.
      */}
      <Handle id="redirect-source" type="source" position={Position.Left} style={hiddenHandleStyle} />
      <Handle id="redirect-target" type="target" position={Position.Right} style={hiddenHandleStyle} />
    </div>
  )
}
