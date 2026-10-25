'use client'

// A live miniature for each project, standing in for screenshots: each one acts out what
// the project does, rather than pretending to be a real capture of it.

import { useEffect, useRef } from 'react'

// CheckGrid: a wall of checkboxes being ticked by many people at once
function CheckGridMini() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hue = getComputedStyle(canvas).getPropertyValue('--accent-h').trim() || '212'
    const CELL = 14
    let cols = 0
    let rows = 0
    let cells = new Float32Array(0) // 0 is unticked, 1 is ticked; values between are fading
    let target = new Uint8Array(0)
    let frame = 0
    let visible = false
    let width = 0
    let height = 0

    const resize = () => {
      const density = Math.min(2, window.devicePixelRatio || 1)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      ctx.setTransform(density, 0, 0, density, 0, 0)
      cols = Math.floor(width / CELL)
      rows = Math.floor(height / CELL)
      target = new Uint8Array(cols * rows).map(() => (Math.random() < 0.3 ? 1 : 0))
      cells = Float32Array.from(target)
    }

    // someone ticks a little cluster, the way a person sweeps across a few boxes
    const burst = () => {
      const cx = Math.floor(Math.random() * cols)
      const cy = Math.floor(Math.random() * rows)
      const value = Math.random() < 0.6 ? 1 : 0
      for (let i = 0; i < 6; i++) {
        const x = Math.min(cols - 1, Math.max(0, cx + Math.round((Math.random() - 0.5) * 4)))
        const y = Math.min(rows - 1, Math.max(0, cy + Math.round((Math.random() - 0.5) * 3)))
        target[y * cols + x] = value
      }
    }

    const draw = () => {
      frame = requestAnimationFrame(draw)
      if (!visible) return
      if (!calm) for (let i = 0; i < 3; i++) if (Math.random() < 0.5) burst()
      ctx.clearRect(0, 0, width, height)
      const offsetX = (width - cols * CELL) / 2
      const offsetY = (height - rows * CELL) / 2
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          cells[i] += (target[i] - cells[i]) * 0.2
          const on = cells[i]
          ctx.fillStyle = on > 0.02 ? `hsla(${hue}, 85%, ${55 + on * 15}%, ${0.15 + on * 0.85})` : 'rgba(255, 255, 255, 0.06)'
          ctx.fillRect(offsetX + x * CELL + 2, offsetY + y * CELL + 2, CELL - 4, CELL - 4)
        }
      }
    }

    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    resize()
    watcher.observe(canvas)
    window.addEventListener('resize', resize)
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="mini-canvas" />
}

// the travel billing tool: an invoice under review, with one line flagged as unusual
function BillingMini() {
  const rows = [62, 48, 70, 40, 56, 66]
  return (
    <div className="mini-bill">
      <div className="mini-bill-head">
        <i />
        <i />
      </div>
      {rows.map((width, index) => (
        <div key={index} className={`mini-bill-row${index === 3 ? ' is-flagged' : ''}`}>
          <i style={{ width: `${width}%` }} />
          <b />
          {index === 3 && <span>FLAG</span>}
        </div>
      ))}
      <div className="mini-bill-total">
        <i />
        <b />
      </div>
      <div className="mini-bill-scan" />
    </div>
  )
}

// D.I.K.S.H.A: a small version of her presence, with a voice meter
function DikshaMini() {
  return (
    <div className="mini-diksha">
      <div className="mini-orb">
        <i />
        <i />
        <i />
      </div>
      <div className="mini-wave">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index} style={{ animationDelay: `${(index % 8) * -0.13}s` }} />
        ))}
      </div>
    </div>
  )
}

export default function ProjectVisual({ id }: { id: string }) {
  return (
    <div className="mini" aria-hidden="true">
      {id === 'checkgrid' ? <CheckGridMini /> : id === 'billing' ? <BillingMini /> : id === 'diksha' ? <DikshaMini /> : <div className="mini-blank" />}
    </div>
  )
}
