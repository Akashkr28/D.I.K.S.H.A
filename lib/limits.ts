// Protection for the routes that cost money or expose private features.

// Owner-only features (memory, camera, the private assistant) have no login yet,
// so they only work on Akash's own machine and are refused in any deployed build.
export function ownerOnly(): Response | null {
  if (process.env.NODE_ENV === 'production') return new Response('Not available.', { status: 403 })
  return null
}

// A simple per-visitor rate limit kept in memory. It resets when the server restarts
// and isn't shared between server instances, so on serverless hosting it should be
// replaced with a shared store (Redis or the host's own rate limiting) before launch.
const hits = new Map<string, number[]>()

export function tooMany(request: Request, bucket: string, limit: number, windowMs: number): Response | null {
  const visitor = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  const key = `${bucket}:${visitor}`
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return new Response('Too many requests. Give it a minute.', { status: 429 })
  }
  recent.push(now)
  hits.set(key, recent)
  return null
}
