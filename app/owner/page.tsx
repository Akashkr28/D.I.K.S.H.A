import { notFound } from 'next/navigation'
import Assistant from '../../components/Assistant'

// Akash's private assistant. There's no login yet, so it only exists on his own machine.
export default function Owner() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main style={{ height: '100vh' }}>
      <Assistant />
    </main>
  )
}
