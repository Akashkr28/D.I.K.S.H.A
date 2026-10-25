'use client'

// Reveals anything marked data-reveal as it scrolls into view, and keeps the footer clock
// ticking. Before this runs (or without JavaScript) everything simply stays visible.

import { useEffect, useState } from 'react'

export default function ScrollFX() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('fx')
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-in')
          watcher.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    document.querySelectorAll('[data-reveal]').forEach((element) => watcher.observe(element))
    return () => {
      watcher.disconnect()
      root.classList.remove('fx')
    }
  }, [])
  return null
}

// Akash's local time, in India. Empty until the page is in the browser, so the server and
// the browser never disagree about what time it is.
export function LocalTime() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const update = () => setTime(format.format(new Date()))
    const first = window.setTimeout(update, 0)
    const timer = window.setInterval(update, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [])
  return <span suppressHydrationWarning>{time ? `${time} IST` : '--:--:-- IST'}</span>
}
