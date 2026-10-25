// The public side of D.I.K.S.H.A: answers visitors' questions about Akash.
// No memory, no camera, and nothing beyond what's in content/portfolio.ts.

import Anthropic from '@anthropic-ai/sdk'
import { visitorPrompt } from '@/lib/persona'
import { tooMany } from '@/lib/limits'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const MODEL = process.env.DIKSHA_MODEL ?? 'claude-haiku-4-5-20251001'
const MAX_HISTORY = 12
const MAX_MESSAGE_CHARS = 500

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response('She is offline right now.', { status: 503 })
  // every question costs AI credits, so each visitor gets a ceiling
  const limited = tooMany(request, 'guide', 20, 10 * 60 * 1000)
  if (limited) return limited

  let messages: ChatMessage[]
  try {
    const body = await request.json()
    messages = Array.isArray(body?.messages) ? body.messages : []
  } catch {
    return new Response('Invalid request body.', { status: 400 })
  }

  // keep only well-formed turns, cap their length and how far back we look
  const history = messages
    .filter(
      (m) =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim() !== '',
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_HISTORY)
  while (history.length && history[0].role !== 'user') history.shift()
  if (!history.length || history[history.length - 1].role !== 'user') {
    return new Response('No question to answer.', { status: 400 })
  }

  const client = new Anthropic()
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 300,
    system: visitorPrompt(),
    messages: history,
  })

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      stream.on('text', (text) => controller.enqueue(encoder.encode(text)))
      try {
        await stream.finalMessage()
      } catch (err) {
        console.error('guide stream failed:', err)
        controller.enqueue(encoder.encode(' Sorry, something went wrong on my side. Please try again.'))
      }
      controller.close()
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
