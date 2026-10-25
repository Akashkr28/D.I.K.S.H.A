// Body-language cues. The model writes short tags such as [happy] or [wave] in its
// reply; we act them out on the avatar and strip them before the text is shown or spoken.

export const EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'relaxed'] as const
export type Emotion = (typeof EMOTIONS)[number]

export const GESTURES = ['nod', 'shake', 'wave', 'shrug', 'tilt'] as const
export type Gesture = (typeof GESTURES)[number]

const CUE = new RegExp(`\\[(${[...EMOTIONS, ...GESTURES].join('|')})\\]\\s*`, 'gi')

// every complete cue found so far, in order
export function findCues(text: string): string[] {
  return [...text.matchAll(CUE)].map((match) => match[1].toLowerCase())
}

// the reply without cues. a half-arrived tag at the very end ("[hap") is hidden too,
// so it never flashes on screen while the reply is streaming.
export function stripCues(text: string): string {
  return text.replace(CUE, '').replace(/\[[a-z]*$/i, '')
}

export const isEmotion = (cue: string): cue is Emotion => (EMOTIONS as readonly string[]).includes(cue)
export const isGesture = (cue: string): cue is Gesture => (GESTURES as readonly string[]).includes(cue)
