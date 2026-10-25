import Anthropic from '@anthropic-ai/sdk'
import { ownerPrompt } from '@/lib/persona'
import { loadMemories, memoryPrompt } from '@/lib/memory'
import { ownerOnly } from '@/lib/limits'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const MODEL = process.env.DIKSHA_MODEL ?? 'claude-haiku-4-5-20251001'
const MAX_HISTORY = 20
const MAX_IMAGE_CHARS = 2_000_000 // base64 length, roughly 1.5 MB of JPEG
// what face-api.js can report
const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised']

export async function POST(request: Request) {
  // this is the private assistant: memory, camera, the lot. visitors use /api/guide instead.
  const blocked = ownerOnly()
  if (blocked) return blocked

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('ANTHROPIC_API_KEY is missing. Add it to .env.local and restart the dev server.', {
      status: 500,
    })
  }

  let messages: ChatMessage[]
  let image: string | null = null
  let emotion: string | null = null
  try {
    const body = await request.json()
    messages = Array.isArray(body?.messages) ? body.messages : []
    // an optional camera frame: base64 JPEG without the data: prefix
    if (typeof body?.image === 'string' && body.image.length <= MAX_IMAGE_CHARS && /^[A-Za-z0-9+/=]+$/.test(body.image)) {
      image = body.image
    }
    // the expression read from the camera. it goes into her system prompt, so only known labels get through.
    if (EMOTIONS.includes(body?.emotion)) emotion = body.emotion
  } catch {
    return new Response('Invalid request body.', { status: 400 })
  }

  // only keep well-formed, non-empty turns, and cap how much history we send
  const history = messages
    .filter(
      (m) =>
        (m?.role === 'user' || m?.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim() !== '',
    )
    .slice(-MAX_HISTORY)

  // the API needs the conversation to start with a user turn
  while (history.length && history[0].role !== 'user') history.shift()
  if (!history.length) return new Response('No message to answer.', { status: 400 })

  // if the camera is on, the frame rides along with the newest user message
  const last = history.length - 1
  const turns: Anthropic.MessageParam[] = history.map((m, i) =>
    image && i === last && m.role === 'user'
      ? {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: m.content },
          ],
        }
      : m,
  )

  // build system prompt with emotion awareness
  const emotionContext = emotion
    ? `\n\nUser's current emotional state: ${emotion}. Use this naturally in conversation - be cheerful if happy, supportive if sad, calm if angry. Do not announce you're detecting emotion.`
    : ''

  const client = new Anthropic()
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 600,
    system: ownerPrompt + memoryPrompt(await loadMemories()) + emotionContext,
    messages: turns,
  })

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      stream.on('text', (text) => controller.enqueue(encoder.encode(text)))
      try {
        await stream.finalMessage()
      } catch (err) {
        console.error('chat stream failed:', err)
        controller.enqueue(encoder.encode('\n(Something went wrong on my side. Try again.)'))
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
