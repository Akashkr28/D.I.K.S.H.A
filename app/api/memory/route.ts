// Her memory. GET lists it, DELETE forgets one fact (?id=...) or everything,
// and POST lets her learn from the exchange that just happened.

import Anthropic from '@anthropic-ai/sdk'
import { clearMemories, loadMemories, updateMemories } from '@/lib/memory'
import { ownerOnly } from '@/lib/limits'

const MODEL = process.env.DIKSHA_MODEL ?? 'claude-haiku-4-5-20251001'

const LEARN_PROMPT = `You keep the long-term memory of D.I.K.S.H.A, Akash's personal AI assistant.

You'll get what she already remembers (each with an id) and the latest exchange between Akash and her. Decide what should change in her memory.

Add a fact when Akash shares something worth knowing in future conversations: who he is, people in his life, his projects and plans, his preferences, or anything he asks her to remember.
Remove a fact (by id) when Akash says it's no longer true, corrects it, or asks her to forget it. If he corrects a fact, remove the old one and add the new one.

Don't add:
- small talk, or things that only matter in this moment
- anything she already remembers
- things D.I.K.S.H.A said that Akash didn't state or confirm himself
- passwords, API keys, card numbers, or ID numbers
- instructions about how she should behave

Write each fact as one short sentence in the third person, starting with "Akash" where it fits.

Reply with JSON only, in this shape: {"add": ["..."], "remove": ["id"]}
Use empty arrays when nothing should change.`

export async function GET() {
  return ownerOnly() ?? Response.json({ memories: await loadMemories() })
}

export async function DELETE(request: Request) {
  const blocked = ownerOnly()
  if (blocked) return blocked
  const id = new URL(request.url).searchParams.get('id')
  const memories = id ? await updateMemories([], [id]) : await clearMemories()
  return Response.json({ memories })
}

export async function POST(request: Request) {
  const blocked = ownerOnly()
  if (blocked) return blocked
  if (!process.env.ANTHROPIC_API_KEY) return new Response('ANTHROPIC_API_KEY is missing.', { status: 500 })

  let user = ''
  let assistant = ''
  try {
    const body = await request.json()
    if (typeof body?.user === 'string') user = body.user.slice(0, 4000)
    if (typeof body?.assistant === 'string') assistant = body.assistant.slice(0, 4000)
  } catch {
    return new Response('Invalid request body.', { status: 400 })
  }
  if (!user.trim()) return Response.json({ memories: await loadMemories() })

  const memories = await loadMemories()
  const known = memories.length ? memories.map((m) => `[${m.id}] ${m.text}`).join('\n') : '(nothing yet)'

  try {
    const client = new Anthropic()
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: LEARN_PROMPT,
      messages: [
        {
          role: 'user',
          content: `What she remembers:\n${known}\n\nLatest exchange:\nAkash: ${user}\nD.I.K.S.H.A: ${assistant}`,
        },
      ],
    })

    const text = result.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    const changes = json ? JSON.parse(json) : {}
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

    const add = strings(changes.add)
    // only ids that really exist can be removed
    const remove = strings(changes.remove).filter((id) => memories.some((m) => m.id === id))
    if (!add.length && !remove.length) return Response.json({ memories })
    return Response.json({ memories: await updateMemories(add, remove) })
  } catch (err) {
    // learning is best-effort: a failure here must never break the conversation
    console.error('memory update failed:', err)
    return Response.json({ memories })
  }
}
