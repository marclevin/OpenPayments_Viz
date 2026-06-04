import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from 'reactflow'

// Several edges can share the same two endpoints (e.g. the Client calls one Auth Server for the
// quote grant, the recurring grant, and the grant continuation). React Flow draws them on top of
// each other, so their labels collide into an unreadable smear. This edge bows each one by a
// per-edge vertical offset (passed in data.offset) so the group fans apart and every label gets
// its own spot. Endpoints stay anchored to the real handles; only the middle is pushed.
export function ParallelEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  labelStyle,
  data,
}: EdgeProps) {
  const offset = (data?.offset as number) ?? 0
  const midX = (sourceX + targetX) / 2
  const path = `M ${sourceX},${sourceY} C ${midX},${sourceY + offset} ${midX},${targetY + offset} ${targetX},${targetY}`
  const labelX = midX
  const labelY = (sourceY + targetY) / 2 + offset

  // labelStyle is authored for SVG <text> (uses `fill`); translate it for the HTML label box.
  const { fill, ...restLabelStyle } = (labelStyle as Record<string, unknown>) ?? {}

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'rgba(255, 255, 255, 0.82)',
              padding: '1px 4px',
              borderRadius: 4,
              pointerEvents: 'none',
              color: (fill as string) ?? 'rgba(11, 18, 32, 0.72)',
              ...restLabelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}
