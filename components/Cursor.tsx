'use client'

// A custom cursor for mouse and trackpad users: a dot that follows exactly and a ring that
// trails it, grows over anything clickable, and shows a word (data-cursor="View") over
// elements that ask for one. Elements marked data-magnetic lean toward the pointer.
// Touch screens and reduced-motion visitors keep the normal cursor.

import { useEffect, useRef } from 'react'

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dot = dotRef.current
    const ring = ringRef.current
    const label = labelRef.current
    if (!fine || calm || !dot || !ring || !label) return

    document.documentElement.classList.add('has-cursor')
    const pointer = { x: -100, y: -100 }
    const trail = { x: -100, y: -100 }
    let magnet: HTMLElement | null = null
    let frame = 0

    const onMove = (e: MouseEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      const target = e.target instanceof Element ? e.target : null

      // what's under the pointer decides the ring's look
      const typing = target?.closest('input, textarea')
      const labelled = target?.closest<HTMLElement>('[data-cursor]')
      const clickable = target?.closest('a, button, [role="button"], label, summary')
      ring.classList.toggle('is-hidden', !!typing)
      dot.classList.toggle('is-hidden', !!typing)
      ring.classList.toggle('is-hover', !!clickable && !labelled)
      ring.classList.toggle('is-label', !!labelled)
      label.textContent = labelled?.dataset.cursor ?? ''

      // magnetic controls drift toward the pointer, and settle back when it leaves
      const next = target?.closest<HTMLElement>('[data-magnetic]') ?? null
      if (magnet && magnet !== next) magnet.style.transform = ''
      magnet = next
      if (magnet) {
        const box = magnet.getBoundingClientRect()
        const dx = e.clientX - (box.left + box.width / 2)
        const dy = e.clientY - (box.top + box.height / 2)
        magnet.style.transform = `translate(${dx * 0.25}px, ${dy * 0.3}px)`
      }
    }
    const onLeave = () => {
      pointer.x = -100
      pointer.y = -100
    }
    const onDown = () => ring.classList.add('is-down')
    const onUp = () => ring.classList.remove('is-down')

    const tick = () => {
      trail.x += (pointer.x - trail.x) * 0.18
      trail.y += (pointer.y - trail.y) * 0.18
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`
      ring.style.transform = `translate3d(${trail.x}px, ${trail.y}px, 0)`
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      document.documentElement.classList.remove('has-cursor')
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      if (magnet) magnet.style.transform = ''
    }
  }, [])

  return (
    <div aria-hidden="true">
      <div ref={ringRef} className="cursor-ring">
        <span ref={labelRef} />
      </div>
      <div ref={dotRef} className="cursor-dot" />
    </div>
  )
}
