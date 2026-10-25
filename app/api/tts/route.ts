// Turns one sentence into speech and streams the audio back.
// Without a key this answers 501 and the page falls back to the browser voice.

import { DEFAULT_VOICE, hasSpeechKey, synthesize } from '@/lib/elevenlabs'
import { tooMany } from '@/lib/limits'

const MAX_CHARS = 600

export async function POST(request: Request) {
  if (!hasSpeechKey()) return new Response('ELEVENLABS_API_KEY is not set.', { status: 501 })
  // every sentence costs speech credits, so visitors get a ceiling
  const limited = tooMany(request, 'tts', 40, 10 * 60 * 1000)
  if (limited) return limited

  let text = ''
  let voiceId = DEFAULT_VOICE
  let speed = 0.9
  try {
    const body = await request.json()
    if (typeof body?.text === 'string') text = body.text.trim()
    // the page can pick a voice and pace. ids are 20 letters and digits.
    if (typeof body?.voiceId === 'string' && /^[A-Za-z0-9]{20}$/.test(body.voiceId)) voiceId = body.voiceId
    if (typeof body?.speed === 'number' && Number.isFinite(body.speed)) speed = Math.min(1.2, Math.max(0.7, body.speed))
  } catch {
    return new Response('Invalid request body.', { status: 400 })
  }
  if (!text) return new Response('Nothing to say.', { status: 400 })
  if (text.length > MAX_CHARS) return new Response('Text is too long.', { status: 413 })

  const res = await synthesize(text, voiceId, speed)
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    console.error('tts failed:', res.status, detail)
    // while developing, pass the service's own reason along so it's easy to see what's wrong
    const reason = process.env.NODE_ENV === 'production' ? '' : ` (${res.status}) ${detail.slice(0, 400)}`
    return new Response(`Speech service failed.${reason}`, { status: 502 })
  }

  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}
