// Her recorded introduction, one audio file per line of the script in content/portfolio.ts.
//
// On Akash's machine, a line is recorded the first time it's requested and saved to
// public/intro/. If he edits a line, it's recorded again. Commit those files and the
// deployed site serves them as plain static audio: instant, and free for every visitor.

import { promises as fs } from 'fs'
import path from 'path'
import { intro } from '@/content/portfolio'
import { DEFAULT_VOICE, SPEECH_MODEL, hasSpeechKey, synthesize } from '@/lib/elevenlabs'

const FOLDER = path.join(process.cwd(), 'public', 'intro')

export async function GET(request: Request, context: { params: Promise<{ index: string }> }) {
  const { index } = await context.params
  const line = intro[Number(index)]
  if (!/^\d+$/.test(index) || !line) return new Response('No such line.', { status: 404 })

  // deployed: the recording is a static file, so just point the browser at it
  if (process.env.NODE_ENV === 'production') {
    return Response.redirect(new URL(`/intro/${index}.mp3`, request.url), 307)
  }

  const audioFile = path.join(FOLDER, `${index}.mp3`)
  const noteFile = path.join(FOLDER, `${index}.txt`)
  // the note records what the audio says and in which voice, so we know when it's stale
  const note = `${DEFAULT_VOICE} ${SPEECH_MODEL}\n${line.text}`

  try {
    if ((await fs.readFile(noteFile, 'utf8')) === note) {
      return new Response(new Uint8Array(await fs.readFile(audioFile)), { headers: { 'Content-Type': 'audio/mpeg' } })
    }
  } catch {
    // not recorded yet
  }

  if (!hasSpeechKey()) return new Response('Not recorded, and no speech key to record it.', { status: 404 })
  const res = await synthesize(line.text)
  if (!res.ok) {
    console.error('intro recording failed:', res.status, await res.text().catch(() => ''))
    return new Response('Recording failed.', { status: 502 })
  }

  const audio = new Uint8Array(await res.arrayBuffer())
  await fs.mkdir(FOLDER, { recursive: true })
  await fs.writeFile(audioFile, audio)
  await fs.writeFile(noteFile, note)
  return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } })
}
