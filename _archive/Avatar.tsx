'use client'

import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import type { Emotion, Gesture } from '@/lib/cues'
import type { Lips } from '@/lib/visemes'

export type AvatarState = 'idle' | 'listening' | 'thinking' | 'talking'

// returns the mouth shapes for the audio playing right now, or null when there's no audio to measure
export type MouthLevel = () => Lips | null

const LIP_SHAPES = ['aa', 'ih', 'ou', 'ee', 'oh'] as const

// a new object each time, so the same gesture can be played twice in a row
export type GestureCue = { name: Gesture }

type CharacterProps = {
  url: string
  state: AvatarState
  emotion: Emotion
  gesture: GestureCue | null
  mouthLevel?: MouthLevel
}

// how far the upper arms rotate down from the T-pose the model loads in.
// if the arms go up instead of down, flip the signs where REST_ARM is used.
const REST_ARM = 1.25

// seconds each gesture lasts
const DURATION: Record<Gesture, number> = { nod: 1.2, shake: 1.4, wave: 2.6, shrug: 1.8, tilt: 2 }

// face presets and how strongly to show each. full strength looks cartoonish.
const FACE = { happy: 0.8, sad: 0.85, angry: 0.75, surprised: 0.9, relaxed: 0.75 } as const
type FaceName = keyof typeof FACE
const FACE_NAMES = Object.keys(FACE) as FaceName[]

function Character({ url, state, emotion, gesture, mouthLevel }: CharacterProps) {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    loader.register((parser) => new VRMLoaderPlugin(parser))
  })
  const vrm = gltf.userData.vrm as VRM
  const camera = useThree((s) => s.camera)

  // everything the animation remembers between frames
  const anim = useRef({
    blinkAt: 2,
    blinkLeft: 0,
    lips: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 },
    weights: { listening: 0, thinking: 0, talking: 0 },
    face: { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
    gesture: null as Gesture | null,
    gestureStart: -1,
    gaze: new Object3D(),
    gazeGoal: new Vector3(),
    gazeDrift: new Vector3(),
    gazeAt: 0,
  })

  // three.js objects are meant to be mutated in place, so React's immutability
  // rule is switched off for this one-time setup
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    VRMUtils.rotateVRM0(vrm) // old VRM 0.x models face backwards
    vrm.scene.traverse((o) => {
      o.frustumCulled = false
    })
    camera.lookAt(0, 1.3, 0)
    anim.current.gaze.position.copy(camera.position)
    // her eyes follow this point
    if (vrm.lookAt) vrm.lookAt.target = anim.current.gaze
  }, [vrm, camera])
  /* eslint-enable react-hooks/immutability */

  // start a gesture whenever a new cue arrives
  useEffect(() => {
    if (!gesture) return
    anim.current.gesture = gesture.name
    anim.current.gestureStart = -1
  }, [gesture])

  useFrame(({ clock }, delta) => {
    const a = anim.current
    const t = clock.elapsedTime
    const ease = Math.min(1, delta * 6)
    const face = vrm.expressionManager

    // some bones are optional in VRM, so missing ones are skipped
    const pose = (name: VRMHumanBoneName, x = 0, y = 0, z = 0) => {
      vrm.humanoid.getNormalizedBoneNode(name)?.rotation.set(x, y, z)
    }

    // fade between states instead of snapping
    for (const key of ['listening', 'thinking', 'talking'] as const) {
      a.weights[key] += ((state === key ? 1 : 0) - a.weights[key]) * ease
    }
    const { listening, thinking, talking } = a.weights

    // lips follow the real audio when we have it, and a simple open-close
    // rhythm when we don't (browser voices expose no audio)
    let lipGoal: Lips = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 }
    if (state === 'talking') {
      lipGoal = mouthLevel?.() ?? { ...lipGoal, aa: (Math.sin(t * 14) * 0.5 + 0.5) * 0.7 }
    }
    // quick enough to hit each sound, slow enough not to flicker
    const lipEase = Math.min(1, delta * 28)
    let voice = 0 // how much energy she's speaking with, used for her hands and head
    for (const shape of LIP_SHAPES) {
      a.lips[shape] += (lipGoal[shape] - a.lips[shape]) * lipEase
      face?.setValue(shape, a.lips[shape])
      voice = Math.max(voice, a.lips[shape])
    }

    // the current one-shot gesture: 0 → 1 → 0 over its duration
    let strength = 0
    let gt = 0
    if (a.gesture) {
      if (a.gestureStart < 0) a.gestureStart = t
      gt = t - a.gestureStart
      const progress = gt / DURATION[a.gesture]
      if (progress >= 1) {
        a.gesture = null
      } else {
        const ramp = Math.min(1, progress * 5, (1 - progress) * 5)
        strength = ramp * ramp * (3 - 2 * ramp)
      }
    }
    const doing = (name: Gesture) => (a.gesture === name ? strength : 0)
    const nod = doing('nod')
    const shake = doing('shake')
    const wave = doing('wave')
    const shrug = doing('shrug')
    const tilt = doing('tilt')

    const breath = Math.sin(t * 1.5)
    const sway = Math.sin(t * 0.5) // slow weight shift from side to side
    // a small nod every few seconds while she's listening
    const listenNod = listening * Math.max(0, Math.sin(t * 0.9)) ** 10 * Math.sin(t * 9) * 0.08

    // torso: weight shift, breathing, leaning in to listen
    pose('hips', 0, Math.sin(t * 0.3) * 0.03, sway * 0.015)
    pose('spine', listening * 0.05 - thinking * 0.02, 0, -sway * 0.015 + thinking * 0.03)
    pose('chest', breath * 0.02, 0, 0)

    // head: idle drift, looking away to think, bobbing along with speech, plus gestures
    pose(
      'head',
      Math.sin(t * 0.9) * 0.03 -
        thinking * 0.15 +
        listening * 0.04 +
        listenNod +
        talking * Math.sin(t * 4.3) * 0.04 * (0.4 + voice) +
        nod * Math.sin(gt * 11) * 0.22,
      Math.sin(t * 0.6) * 0.08 * (1 - talking * 0.5) + thinking * 0.2 + shake * Math.sin(gt * 11) * 0.3,
      thinking * 0.12 + listening * 0.05 + tilt * 0.25 + shrug * 0.1,
    )

    pose('leftShoulder', 0, 0, breath * 0.01 + shrug * 0.2)
    pose('rightShoulder', 0, 0, -breath * 0.01 - shrug * 0.2)

    // arms hang relaxed, and the forearms lift and move while she talks.
    // the two hands are slightly out of step so it doesn't look mechanical.
    const armSway = Math.sin(t * 0.7) * 0.02
    const talkLeft = talking * (0.85 + 0.3 * Math.sin(t * 2.1) + voice * 0.5)
    const talkRight = talking * (0.85 + 0.3 * Math.sin(t * 2.1 + 1.7) + voice * 0.5)

    // a shrug lifts the shoulders and turns the forearms and palms up
    pose('leftUpperArm', -talkLeft * 0.2, 0, -REST_ARM + armSway)
    pose('leftLowerArm', 0, -(0.15 + talkLeft + shrug * 1.1), 0)
    pose('leftHand', shrug * -1.2 - talkLeft * 0.5, 0, 0)

    // the right arm also does the waving: upper arm lifts, forearm swings side to side
    pose(
      'rightUpperArm',
      -talkRight * 0.2 * (1 - wave),
      0,
      REST_ARM - armSway - wave * (REST_ARM + 0.25),
    )
    pose('rightLowerArm', 0, (0.15 + talkRight + shrug * 1.1) * (1 - wave), wave * (-1.25 + Math.sin(gt * 9) * 0.35))
    pose('rightHand', wave * -1.4 + shrug * -1.2 - talkRight * 0.5 * (1 - wave), 0, 0) // turn the palm forward to wave, up to shrug

    // eyes: look at the viewer with small darting movements, and look away while thinking
    if (t > a.gazeAt) {
      a.gazeAt = t + 1 + Math.random() * 2.5
      a.gazeDrift.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, 0)
    }
    a.gazeGoal.copy(camera.position).add(a.gazeDrift)
    a.gazeGoal.x += thinking * 0.9
    a.gazeGoal.y += thinking * 0.5
    a.gaze.position.lerp(a.gazeGoal, Math.min(1, delta * 10))

    // face: blend toward the current emotion. neutral keeps a faint smile so she looks friendly.
    for (const name of FACE_NAMES) {
      const full = emotion === name ? FACE[name] : emotion === 'neutral' && name === 'happy' ? 0.2 : 0
      // ease the expression off a little while she speaks, so it doesn't fight her lip movement
      const goal = full * (1 - talking * 0.3)
      a.face[name] += (goal - a.face[name]) * Math.min(1, delta * 5)
      face?.setValue(name, a.face[name])
    }

    // blink every few seconds
    if (t > a.blinkAt) {
      a.blinkLeft = 0.15
      a.blinkAt = t + 2 + Math.random() * 4
    }
    a.blinkLeft = Math.max(0, a.blinkLeft - delta)
    face?.setValue('blink', a.blinkLeft > 0 ? 1 : 0)

    // after the tab has been in the background the first frame can cover several seconds,
    // which makes hair and skirt physics explode. cap the step to keep them stable.
    vrm.update(Math.min(delta, 1 / 20))
  })

  return <primitive object={vrm.scene} />
}

type AvatarProps = {
  url?: string
  state?: AvatarState
  emotion?: Emotion
  gesture?: GestureCue | null
  mouthLevel?: MouthLevel
}

export default function Avatar({
  url = '/avatar.vrm',
  state = 'idle',
  emotion = 'neutral',
  gesture = null,
  mouthLevel,
}: AvatarProps) {
  return (
    // close enough to read her face, wide enough to see her hands when she gestures
    <Canvas camera={{ position: [0, 1.35, 1.75], fov: 30 }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[1, 2, 2]} intensity={1.5} />
      <Suspense fallback={null}>
        <Character url={url} state={state} emotion={emotion} gesture={gesture} mouthLevel={mouthLevel} />
      </Suspense>
    </Canvas>
  )
}
