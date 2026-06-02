import type { StepStatus } from '@opviz/shared'
import { Handle, Position, type NodeProps } from 'reactflow'
import { getEntityColorVar } from '../lib/colorMap'

type FlowNodeData = {
  label: string
  kind: string
  status?: StepStatus
  selected?: boolean
}

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

export function FlowNode({ data }: NodeProps<FlowNodeData>) {
  const entityVar = getEntityColorVar(data.label, data.kind)
  const entityColor = `var(${entityVar})`
  return (
    <div
      className={`flowNodeCard status-${data.status ?? 'idle'}${data.selected ? ' is-selected' : ''}`}
      style={{
        borderRadius: 16,
        border: `1px solid ${data.selected ? 'rgba(0,59,92,0.45)' : 'rgba(15,23,42,0.16)'}`,
        borderLeft: `5px solid ${entityColor}`,
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
    </div>
  )
}
