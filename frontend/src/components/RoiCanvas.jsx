import { useEffect, useRef } from 'react'

export function normalizeRoi(x1, y1, x2, y2) {
  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
  }
}

function clampPoint(x, y, width, height) {
  return {
    x: Math.round(Math.min(Math.max(x, 0), width)),
    y: Math.round(Math.min(Math.max(y, 0), height)),
  }
}

const MIN_ROI_SIZE = 4 // frame-pixel threshold below which a drag is treated as a stray click

export default function RoiCanvas({ width, height, roi, onChange, style }) {
  const canvasRef = useRef(null)
  const startRef = useRef(null)
  const lastRectRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    if (!roi) return
    const w = roi.x2 - roi.x1
    const h = roi.y2 - roi.y1
    // Dark solid underlay so the dashed stroke stays readable on bright sky
    // and dark asphalt alike; the gaps show the underlay through.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.lineWidth = 4
    ctx.setLineDash([])
    ctx.strokeRect(roi.x1, roi.y1, w, h)
    ctx.strokeStyle = '#2ecc71'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.strokeRect(roi.x1, roi.y1, w, h)
  }, [roi, width, height])

  function pointFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = width / rect.width
    const scaleY = height / rect.height
    return clampPoint((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY, width, height)
  }

  function handlePointerDown(e) {
    const p = pointFromEvent(e)
    startRef.current = p
    const rect = normalizeRoi(p.x, p.y, p.x, p.y)
    lastRectRef.current = rect
    onChange(rect)
  }
  function handlePointerMove(e) {
    if (!startRef.current) return
    const p = pointFromEvent(e)
    const rect = normalizeRoi(startRef.current.x, startRef.current.y, p.x, p.y)
    lastRectRef.current = rect
    onChange(rect)
  }
  function handlePointerUp() {
    if (startRef.current) {
      const rect = lastRectRef.current
      if (rect && rect.x2 - rect.x1 < MIN_ROI_SIZE && rect.y2 - rect.y1 < MIN_ROI_SIZE) {
        onChange(null)
      }
    }
    startRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="roi-canvas"
      width={width}
      height={height}
      className="roi-canvas"
      style={{ cursor: 'crosshair', touchAction: 'none', ...style }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
}
