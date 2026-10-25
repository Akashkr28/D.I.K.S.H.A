'use client'

// D.I.K.S.H.A's 3D presence: a plasma orb with veins of light, comets running round three
// orbits, drifting dust, and a halo, all passed through a bloom filter so the bright parts glow.
// Loaded lazily by ThreeDPresence, so three.js only downloads when she's on screen.

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { HUES, fakeVoice, type PresenceProps } from '@/lib/presence'
import {
  dustFragment,
  dustVertex,
  facingVertex,
  haloFragment,
  orbFragment,
  orbVertex,
  ringFragment,
  ringVertex,
  shockFragment,
} from './coreShaders'

// everything the parts of the scene animate from, worked out once per frame
type Drive = {
  started: boolean
  calm: boolean // the visitor prefers reduced motion
  time: number
  level: number // how lively she is, 0 to 1
  hue: number // 0 to 1
  talk: number // fades the speaking effects in and out
  glow: number // overall brightness; low while dormant
  phase: number // how far the comets have travelled
  pulseAt: number // when the latest wake-up burst started
  seenPulse: number
}
type DriveRef = RefObject<Drive>

// pure black, because the canvas is blended onto the page with `screen`: black adds nothing,
// so only her light shows over whatever is behind her
const BACKGROUND = '#000000'

// how far out the camera must see: the outer orbit and the dust around it, with room to spare
const FIT_RADIUS = 4

// works out the shared values from her state. a plain function, since it updates `d` in place.
function step(d: Drive, delta: number, { state, energy, dormant = false, pulse = 0 }: PresenceProps) {
  if (!d.started) {
    d.started = true
    d.calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  const dt = Math.min(0.05, delta) * (d.calm ? 0.35 : 1)
  d.time += dt

  const voice = Math.max(0, energy() ?? fakeVoice(d.time))
  let target = 0.1 + 0.04 * Math.sin(d.time * 1.2) // idle: slow breathing
  if (state === 'listening') target = 0.3 + 0.06 * Math.sin(d.time * 3.2)
  if (state === 'thinking') target = 0.22
  if (state === 'talking') target = 0.15 + 0.85 * voice
  if (dormant) target *= 0.4

  d.level += (target - d.level) * Math.min(1, dt * 14)
  d.hue += (HUES[state] / 360 - d.hue) * Math.min(1, dt * 3)
  d.talk += ((state === 'talking' ? 1 : 0) - d.talk) * Math.min(1, dt * 5)
  d.glow += ((dormant ? 0.35 : 1) - d.glow) * Math.min(1, dt * 2.5)

  // the comets race while she thinks, quicken while she listens, and surge with her voice
  const speed = state === 'thinking' ? 0.55 : state === 'listening' ? 0.2 : 0.09 + d.talk * d.level * 0.25
  d.phase += dt * speed

  if (pulse !== d.seenPulse) {
    d.seenPulse = pulse
    if (!d.calm) d.pulseAt = d.time
  }
}

function Driver({ drive, ...props }: PresenceProps & { drive: DriveRef }) {
  useFrame((_, delta) => step(drive.current, delta, props))
  return null
}

function Orb({ drive }: { drive: DriveRef }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({ uFlow: { value: 0 }, uLevel: { value: 0 }, uHue: { value: HUES.idle / 360 }, uGlow: { value: 0.35 } }),
    [],
  )

  useFrame((_, delta) => {
    const d = drive.current
    if (!mesh.current || !material.current) return
    const u = material.current.uniforms
    // the plasma's own clock: steady, plus the comets' pace, so it boils faster when she's busy
    u.uFlow.value = d.time * 0.3 + d.phase * 1.2
    u.uLevel.value = d.level
    u.uHue.value = d.hue
    u.uGlow.value = d.glow
    mesh.current.rotation.y += Math.min(0.05, delta) * 0.15
    mesh.current.scale.setScalar(1 + d.level * 0.12)
  })

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[0.9, 40]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={orbVertex} fragmentShader={orbFragment} toneMapped={false} />
    </mesh>
  )
}

// a card that keeps turning to face the camera, drawn with additive light
function FacingCard({ size, fragment, update }: { size: number; fragment: string; update: (u: Record<string, THREE.IUniform>) => void }) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({ uHue: { value: 0 }, uStrength: { value: 0 }, uProgress: { value: 0 }, uSize: { value: size / 2 } }),
    [size],
  )
  useFrame(({ camera }) => {
    if (!mesh.current || !material.current) return
    mesh.current.quaternion.copy(camera.quaternion)
    update(material.current.uniforms)
  })
  return (
    <mesh ref={mesh} renderOrder={-1}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={facingVertex}
        fragmentShader={fragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

function Halo({ drive }: { drive: DriveRef }) {
  return (
    <FacingCard
      size={7}
      fragment={haloFragment}
      update={(u) => {
        const d = drive.current
        u.uHue.value = d.hue
        u.uStrength.value = (0.22 + d.level * 0.35) * d.glow
      }}
    />
  )
}

// the burst of light when she wakes. `delay` staggers a second ring just behind the first.
function Shockwave({ drive, delay }: { drive: DriveRef; delay: number }) {
  return (
    <FacingCard
      size={8}
      fragment={shockFragment}
      update={(u) => {
        const d = drive.current
        u.uHue.value = d.hue
        u.uProgress.value = d.pulseAt < 0 ? 0 : (d.time - d.pulseAt - delay) / 1.6
      }}
    />
  )
}

type OrbitProps = {
  drive: DriveRef
  radius: number
  tilt: [number, number, number]
  spin: [number, number] // how fast the orbit itself turns, around x and y
  offset: number // where its comet starts
  hueShift: number
  direction: 1 | -1
}

function Orbit({ drive, radius, tilt, spin, offset, hueShift, direction }: OrbitProps) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({ uPhase: { value: 0 }, uOffset: { value: offset }, uHue: { value: 0 }, uLevel: { value: 0 }, uGlow: { value: 0 } }),
    [offset],
  )
  useFrame((_, delta) => {
    const d = drive.current
    if (!group.current || !material.current) return
    const dt = Math.min(0.05, delta) * (d.calm ? 0.35 : 1)
    group.current.rotation.x += dt * spin[0]
    group.current.rotation.y += dt * spin[1]
    const u = material.current.uniforms
    u.uPhase.value = d.phase * direction
    u.uHue.value = d.hue + hueShift
    u.uLevel.value = d.level
    u.uGlow.value = d.glow
  })
  return (
    <group rotation={tilt}>
      <group ref={group}>
        <mesh>
          <torusGeometry args={[radius, 0.011, 8, 320]} />
          <shaderMaterial
            ref={material}
            uniforms={uniforms}
            vertexShader={ringVertex}
            fragmentShader={ringFragment}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}

// specks scattered through a shell around her. built once, outside render, because random
// numbers during render would give a different cloud each time.
const DUST_COUNT = 1800
function makeDust() {
  const positions = new Float32Array(DUST_COUNT * 3)
  const seeds = new Float32Array(DUST_COUNT)
  for (let i = 0; i < DUST_COUNT; i++) {
    const radius = 1.3 + Math.pow(Math.random(), 0.7) * 2.4
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.8 // a little flattened, like a galaxy
    positions[i * 3 + 2] = radius * Math.cos(phi)
    seeds[i] = Math.random()
  }
  return { positions, seeds }
}
const DUST = makeDust()

function Dust({ drive }: { drive: DriveRef }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uLevel: { value: 0 }, uHue: { value: 0 }, uGlow: { value: 0 }, uPixelRatio: { value: 1 } }),
    [],
  )
  useFrame(({ gl }) => {
    const d = drive.current
    if (!material.current) return
    const u = material.current.uniforms
    u.uTime.value = d.time
    u.uLevel.value = d.level * d.talk
    u.uHue.value = d.hue
    u.uGlow.value = d.glow
    u.uPixelRatio.value = gl.getPixelRatio()
  })
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[DUST.positions, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[DUST.seeds, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={dustVertex}
        fragmentShader={dustFragment}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}

// fits the scene to the canvas and lets it lean a little toward the mouse
function CameraRig() {
  const mouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])
  useFrame(({ camera }) => {
    // back off far enough that the whole scene fits, whether the canvas is wide or tall
    const view = camera as THREE.PerspectiveCamera
    const distance = FIT_RADIUS / Math.tan(THREE.MathUtils.degToRad(view.fov / 2)) / Math.min(1, view.aspect)
    camera.position.x += (mouse.current.x * 0.9 - camera.position.x) * 0.04
    camera.position.y += (mouse.current.y * 0.9 - camera.position.y) * 0.04
    camera.position.z += (distance - camera.position.z) * 0.1
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function CoreScene(props: PresenceProps) {
  const drive = useRef<Drive>({
    started: false,
    calm: false,
    time: 0,
    level: 0.1,
    hue: HUES.idle / 360,
    talk: 0,
    glow: props.dormant ? 0.35 : 1,
    phase: 0,
    pulseAt: -1,
    seenPulse: props.pulse ?? 0,
  })

  return (
    <Canvas
      camera={{ position: [0, 0, 9.7], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <Driver {...props} drive={drive} />
      <Halo drive={drive} />
      <Dust drive={drive} />
      <Orb drive={drive} />
      <Orbit drive={drive} radius={1.75} tilt={[1.15, 0.2, 0]} spin={[0.05, 0.12]} offset={0} hueShift={0.04} direction={1} />
      <Orbit drive={drive} radius={2.3} tilt={[-0.5, 0.6, 0.3]} spin={[0.08, -0.06]} offset={0.4} hueShift={-0.06} direction={-1} />
      <Orbit drive={drive} radius={2.85} tilt={[0.3, -0.9, 0.9]} spin={[-0.04, 0.05]} offset={0.75} hueShift={0.12} direction={1} />
      <Shockwave drive={drive} delay={0} />
      <Shockwave drive={drive} delay={0.18} />
      <CameraRig />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.32} luminanceSmoothing={0.25} radius={0.72} />
      </EffectComposer>
    </Canvas>
  )
}
