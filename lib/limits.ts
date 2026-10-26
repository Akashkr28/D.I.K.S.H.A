// Protection for the routes that cost money or expose private features.

// Owner-only features (memory, camera, the private assistant) have no login yet,
// so they only work on Akash's own machine and are refused in any deployed build.
export function ownerOnly(): Response | null {
  if (process.env.NODE_ENV === 'production') return new Response('Not available.', { status: 403 })
  return null
}

// A per-visitor rate limit. On Vercel every request can land on a different server copy,
// so the counts live in Upstash Redis when it's connected (Vercel's Upstash integration sets
// these env vars). Without it, counts are kept in this server's memory, which is fine locally.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

const hits = new Map<string, number[]>()

function countInMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)
  const allowed = recent.length < limit
  if (allowed) recent.push(now)
  hits.set(key, recent)
  return allowed
}

// a fixed window: the first hit starts a counter that expires when the window ends
async function countInRedis(key: string, limit: number, windowMs: number) {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify([
      ['INCR', key],
      ['PEXPIRE', key, String(windowMs), 'NX'],
    ]),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Upstash ${response.status}`)
  const [count] = (await response.json()) as { result: number }[]
  return count.result <= limit
}

export async function tooMany(request: Request, bucket: string, limit: number, windowMs: number): Promise<Response | null> {
  const visitor = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
  const key = `limit:${bucket}:${visitor}`
  let allowed: boolean
  try {
    allowed = REDIS_URL && REDIS_TOKEN ? await countInRedis(key, limit, windowMs) : countInMemory(key, limit, windowMs)
  } catch (err) {
    // if Redis is down, fall back to memory rather than letting everything through
    console.error('rate limit store failed:', err)
    allowed = countInMemory(key, limit, windowMs)
  }
  return allowed ? null : new Response('Too many requests. Give it a minute.', { status: 429 })
}
