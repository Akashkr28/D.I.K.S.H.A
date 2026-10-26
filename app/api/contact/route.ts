// The contact form. Messages are emailed to Akash through Resend (needs RESEND_API_KEY),
// with the visitor's address as reply-to so he can answer straight from his inbox.
// Without a key, local development saves them to data/messages.json instead, and a
// deployed site says the form is offline so the visitor uses the email link.

import { promises as fs } from 'fs'
import path from 'path'
import { profile } from '@/content/portfolio'
import { tooMany } from '@/lib/limits'

const LIMITS = { name: 100, email: 200, company: 120, message: 3000 }

type Message = { name: string; email: string; company: string; message: string }

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function sendEmail(m: Message, key: string) {
  const to = process.env.CONTACT_TO_EMAIL || profile.email
  const lines = [`Name: ${m.name}`, `Email: ${m.email}`, ...(m.company ? [`Company: ${m.company}`] : []), '', m.message]
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // onboarding@resend.dev works until a domain is verified, but only to the Resend account's own email
      from: process.env.CONTACT_FROM_EMAIL || 'Portfolio <onboarding@resend.dev>',
      to: [to],
      reply_to: m.email,
      subject: `Portfolio message from ${m.name}`,
      text: lines.join('\n'),
    }),
  })
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`)
}

async function saveLocally(m: Message) {
  const file = path.join(process.cwd(), 'data', 'messages.json')
  await fs.mkdir(path.dirname(file), { recursive: true })
  const saved = JSON.parse(await fs.readFile(file, 'utf8').catch(() => '[]'))
  saved.push({ ...m, at: new Date().toISOString() })
  await fs.writeFile(file, JSON.stringify(saved, null, 2))
}

export async function POST(request: Request) {
  // a person sends one or two messages; more than this is a bot or someone being a nuisance
  const limited = await tooMany(request, 'contact', 3, 60 * 60 * 1000)
  if (limited) return limited

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // a hidden field people never see. bots fill in everything, so pretend it worked.
  if (clean(body.website, 200)) return Response.json({ ok: true })

  const m: Message = {
    name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email),
    company: clean(body.company, LIMITS.company),
    message: clean(body.message, LIMITS.message),
  }
  if (!m.name || !m.message) return Response.json({ error: 'Please add your name and a message.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) return Response.json({ error: 'That email address looks wrong.' }, { status: 400 })

  const key = process.env.RESEND_API_KEY
  try {
    if (key) await sendEmail(m, key)
    else if (process.env.NODE_ENV !== 'production') await saveLocally(m)
    else return Response.json({ error: `The form is offline. Please email ${profile.email} instead.` }, { status: 503 })
  } catch (err) {
    console.error('contact form failed:', err)
    return Response.json({ error: `Couldn't send that. Please email ${profile.email} instead.` }, { status: 502 })
  }
  return Response.json({ ok: true })
}
