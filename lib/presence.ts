// Shared by the 3D presence and its 2D fallback.

export type PresenceState = 'idle' | 'listening' | 'thinking' | 'talking'

export type PresenceProps = {
  state: PresenceState
  // how loud her voice is right now (0 to 1), or null when there's no audio to measure
  energy: () => number | null
  // dormant: dimmed and quiet, waiting to be woken
  dormant?: boolean
  // change this number to send a burst of light out from her (her "waking up")
  pulse?: number
}

// one colour per state, as hue angles: calm blue, attentive teal, violet while thinking, warm rose when she speaks
export const HUES: Record<PresenceState, number> = { idle: 212, listening: 172, thinking: 262, talking: 342 }

// a speech-like rhythm for when her voice can't be measured (the browser voice, or silent captions)
export const fakeVoice = (t: number) => 0.45 + 0.35 * Math.sin(t * 9) * Math.sin(t * 2.3)
