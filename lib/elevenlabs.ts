// One place that talks to ElevenLabs. Server-side only, since it uses the secret key.

// "Sarah": soft and warm. ElevenLabs' free plan only allows its default voices through the
// API (Sarah, Lily, Jessica, Laura, Alice worked when tested); library voices need a paid plan.
export const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'
export const SPEECH_MODEL = process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5'

export const hasSpeechKey = () => !!process.env.ELEVENLABS_API_KEY

// returns ElevenLabs' response as-is: MP3 audio when ok, an error body otherwise
export function synthesize(text: string, voiceId = DEFAULT_VOICE, speed = 0.9): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: SPEECH_MODEL,
      // high stability and no added style keep her delivery calm and even
      voice_settings: { stability: 0.75, similarity_boost: 0.7, style: 0, speed },
    }),
  })
}
