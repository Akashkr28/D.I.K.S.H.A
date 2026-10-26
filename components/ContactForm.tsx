'use client'

// The contact form in the Contact section. Posts to /api/contact, which emails Akash.

import { useState, type FormEvent } from 'react'

type Status = { kind: 'idle' | 'sending' | 'sent' } | { kind: 'error'; text: string }

export default function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setStatus({ kind: 'sending' })
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const text = response.status === 429 ? 'You’ve sent a few already. Try again in a while.' : result.error || 'Something went wrong.'
        setStatus({ kind: 'error', text })
        return
      }
      form.reset()
      setStatus({ kind: 'sent' })
    } catch {
      setStatus({ kind: 'error', text: 'No connection. Check your internet and try again.' })
    }
  }

  if (status.kind === 'sent') {
    return (
      <div className="contact-form is-sent glass-card" role="status">
        <span className="contact-form-tag">Message received</span>
        <p>Thanks. Akash will reply to you by email.</p>
        <button type="button" className="glass-btn" onClick={() => setStatus({ kind: 'idle' })}>
          Send another
        </button>
      </div>
    )
  }

  const sending = status.kind === 'sending'
  return (
    <form className="contact-form glass-card" onSubmit={submit}>
      <span className="contact-form-tag">Send a message</span>
      <div className="contact-form-row">
        <label>
          <span>Name</span>
          <input className="glass-input" name="name" required maxLength={100} autoComplete="name" />
        </label>
        <label>
          <span>Email</span>
          <input className="glass-input" name="email" type="email" required maxLength={200} autoComplete="email" />
        </label>
      </div>
      <label>
        <span>
          Company <em>optional</em>
        </span>
        <input className="glass-input" name="company" maxLength={120} autoComplete="organization" />
      </label>
      <label>
        <span>Message</span>
        <textarea className="glass-input" name="message" required maxLength={3000} rows={5} placeholder="A role, a project, or just hello" />
      </label>
      {/* hidden from people; bots fill it in and get quietly ignored */}
      <input className="contact-form-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="contact-form-foot">
        <button type="submit" className="glass-btn is-primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send message'}
        </button>
        {status.kind === 'error' && (
          <p className="contact-form-error" role="alert">
            {status.text}
          </p>
        )}
      </div>
    </form>
  )
}
