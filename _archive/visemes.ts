// Turns the per-letter timing that the speech service returns into mouth shapes.
// VRM faces have five vowel shapes (aa, ih, ou, ee, oh). Consonants are done by
// closing the lips (m, b, p) or leaving them slightly parted.

export type Lips = { aa: number; ih: number; ou: number; ee: number; oh: number }
export type LipCue = { start: number; end: number; shape: Partial<Lips> }

const CLOSED: Partial<Lips> = {}
const PARTED: Partial<Lips> = { ih: 0.28, aa: 0.08 } // most consonants: teeth close, lips apart

const VOWELS: Record<string, Partial<Lips>> = {
  a: { aa: 1 },
  e: { ee: 0.85 },
  i: { ih: 0.9 },
  y: { ih: 0.75 },
  o: { oh: 1 },
  u: { ou: 0.9 },
}

const isLetter = (c: string | undefined) => !!c && /[a-z]/.test(c)
const isVowel = (c: string | undefined) => !!c && 'aeiou'.includes(c)

function shapeFor(prev: string | undefined, c: string, next: string | undefined): Partial<Lips> {
  if (/[0-9]/.test(c)) return { aa: 0.6 } // digits are read out as words, so just open
  if (!isLetter(c)) return CLOSED // spaces and punctuation are pauses

  if ('mbp'.includes(c)) return CLOSED // lips press together
  if ('fv'.includes(c)) return { ih: 0.12 } // lower lip to teeth, nearly closed
  if (c === 'w') return { ou: 0.75 }
  if (c === 'r') return { ou: 0.35, ih: 0.15 }

  if (c in VOWELS) {
    if (c === 'o' && (next === 'o' || prev === 'o')) return { ou: 0.9 } // "soon", "too"
    if (c === 'o' && (next === 'u' || next === 'w')) return { aa: 0.7, oh: 0.3 } // "out", "now"
    if (c === 'e' && !isLetter(next) && isLetter(prev) && !isVowel(prev)) return PARTED // silent e: "like"
    if (c === 'y' && !isLetter(prev)) return PARTED // "you", "yes": y is a consonant here
    if (c === 'u' && prev === 'q') return { ou: 0.6 }
    return VOWELS[c]
  }

  return PARTED
}

export function toLipCues(characters: string[], starts: number[], ends: number[]): LipCue[] {
  const letters = characters.map((c) => c.toLowerCase())
  const cues: LipCue[] = []
  for (let i = 0; i < letters.length; i++) {
    if (typeof starts[i] !== 'number' || typeof ends[i] !== 'number') continue
    cues.push({ start: starts[i], end: ends[i], shape: shapeFor(letters[i - 1], letters[i], letters[i + 1]) })
  }
  return cues
}
