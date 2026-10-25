// Browser speech helpers. Listening uses the Web Speech API (Chrome and Edge),
// speaking uses the built-in speechSynthesis voices. Both are free and need no key.

// minimal typing for the recogniser, which Chrome ships as webkitSpeechRecognition
export type Recognizer = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: RecognizerEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

type RecognizerEvent = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export function createRecognizer(): Recognizer | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognizer
    webkitSpeechRecognition?: new () => Recognizer
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

// first match wins. reorder or add names to change how she sounds.
const PREFERRED_VOICES = ['Samantha', 'Karen', 'Google UK English Female', 'Veena']

export function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  for (const name of PREFERRED_VOICES) {
    const match = voices.find((v) => v.name.includes(name))
    if (match) return match
  }
  return voices.find((v) => v.lang.startsWith('en')) ?? null
}

// Pull finished sentences off the front of a streaming reply so she can start
// speaking before the whole answer has arrived. Returns [sentences, leftover].
export function takeSentences(buffer: string): [string[], string] {
  const sentences: string[] = []
  let rest = buffer
  while (true) {
    const match = rest.match(/^([\s\S]*?[.!?]+)\s+/)
    if (!match) break
    const sentence = match[1].trim()
    if (sentence) sentences.push(sentence)
    rest = rest.slice(match[0].length)
  }
  return [sentences, rest]
}
