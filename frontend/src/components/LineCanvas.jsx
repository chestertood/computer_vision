import { useEffect, useRef } from 'react'

export function clampLineY(y, height) {
  if (y < 0) return 0
  if (y > height) return height
  return Math.round(y)
}

export default function LineCanvas({ imageUrl, width, height, lineY, onChange }) {
  const canvasRef = useRef(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      drawLine(ctx, width, lineY)
    }
    img.src = imageUrl
  }, [imageUrl, width, height, lineY])

  function drawLine(ctx, w, y) {
    ctx.strokeStyle = 'red'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  function yFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const scale = height / rect.height
    return clampLineY((e.clientY - rect.top) * scale, height)
  }

  function handlePointerDown(e) {
    draggingRef.current = true
    onChange(yFromEvent(e))
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return
    onChange(yFromEvent(e))
  }
  function handlePointerUp() {
    draggingRef.current = false
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="line-canvas"
      width={width}
      height={height}
      style={{ maxWidth: '100%', cursor: 'ns-resize', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  )
}
