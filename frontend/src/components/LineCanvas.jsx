import { useEffect, useRef } from 'react'

export function clampLineY(y, height) {
  if (y < 0) return 0
  if (y > height) return height
  return Math.round(y)
}

export default function LineCanvas({
  imageUrl,
  width,
  height,
  lineY,
  lineY2,
  colorA = '#2ecc71',
  colorB = '#ff3b30',
  thickness = 4,
  active = true,
  filter = 'none',
  onChangeLine,
  onChangeLine2,
}) {
  const imageCanvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const draggingRef = useRef(null) // 'a' | 'b' | null

  // Base layer: just the frame, with the color filter applied. Lines live on
  // their own unfiltered overlay so grayscale/saturation never touches them.
  useEffect(() => {
    const canvas = imageCanvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
    }
    img.src = imageUrl
  }, [imageUrl, width, height])

  useEffect(() => {
    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    // Same treatment as the ROI box: outside the A-B band is dimmed while the
    // line tool is active, so the picked strip reads at a glance.
    if (!active) return
    const top = Math.min(lineY, lineY2)
    const bottom = Math.max(lineY, lineY2)
    ctx.fillStyle = 'rgba(8, 11, 22, 0.55)'
    ctx.fillRect(0, 0, width, top)
    ctx.fillRect(0, bottom, width, height - bottom)
    drawLine(ctx, width, lineY, colorA, thickness, 'A')
    drawLine(ctx, width, lineY2, colorB, thickness, 'B')
  }, [width, height, lineY, lineY2, colorA, colorB, thickness, active])

  function drawLine(ctx, w, y, strokeColor, lineWidth, label) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    ctx.fillStyle = strokeColor
    ctx.font = 'bold 14px sans-serif'
    ctx.fillText(label, 6, y - 6)
  }

  function yFromEvent(e) {
    const rect = overlayCanvasRef.current.getBoundingClientRect()
    const scale = height / rect.height
    return clampLineY((e.clientY - rect.top) * scale, height)
  }

  function handlePointerDown(e) {
    if (!active) return
    const y = yFromEvent(e)
    draggingRef.current = Math.abs(y - lineY) <= Math.abs(y - lineY2) ? 'a' : 'b'
    ;(draggingRef.current === 'a' ? onChangeLine : onChangeLine2)(y)
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return
    const y = yFromEvent(e)
    ;(draggingRef.current === 'a' ? onChangeLine : onChangeLine2)(y)
  }
  function handlePointerUp() {
    draggingRef.current = null
  }

  return (
    <>
      <canvas
        ref={imageCanvasRef}
        data-testid="line-canvas"
        width={width}
        height={height}
        style={{ maxWidth: '100%', display: 'block', filter }}
      />
      <canvas
        ref={overlayCanvasRef}
        data-testid="line-overlay-canvas"
        width={width}
        height={height}
        className="line-overlay"
        style={{ cursor: active ? 'ns-resize' : 'default', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </>
  )
}
