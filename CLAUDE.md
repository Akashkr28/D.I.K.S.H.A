@AGENTS.md

# D.I.K.S.H.A: personal AI assistant, then portfolio guide

Owner: Akash. Solo full-stack developer (React, Node.js, Python), MCA student in AI/ML,
interested in AI security and prompt engineering. Keep replies short and direct, and write
code and comments that read as human-written.

## What we're building

D.I.K.S.H.A is a 3D AI character (stylised, human-looking, openly an AI). She is built first
as Akash's personal assistant. The public portfolio guide is the same core with memory,
camera, and tools switched off and Akash's project data loaded.

One core, two modes:
- Owner mode (Akash only): talks, listens, remembers, uses tools, can look through the camera.
- Visitor mode (public): guides visitors through Akash's work. Text and voice only, no camera,
  no memory of visitors, no tools beyond navigating the site. Speaks about Akash in third person.
  Answers only from real data and says "I don't know, email Akash" otherwise.

## v1 scope (stop here, everything else goes on a later list)

She talks and listens, remembers things about Akash, has three or four tools, and can look
through the camera on request.

## Build order

1. Chat brain with streaming, wired to the avatar's thinking and talking states  <- current
2. Voice in and out, with real lip sync (replace the placeholder mouth movement)
3. Memory (viewable and deletable by Akash)
4. Portfolio cut: visitor mode with project data. Do this even if the assistant isn't done.
5. Tools, with confirmation before anything that sends or deletes
6. Camera on request, with an on-screen indicator when live
7. Login and locking down owner mode before any public deployment

Until step 7 she runs only on localhost.

## Current state

- Next.js (App Router) + TypeScript. Dependencies: three, @react-three/fiber, @pixiv/three-vrm.
- components/Avatar.tsx: client component. Loads /avatar.vrm, lowers the arms from the T-pose,
  breathing, head sway, blinking, thinking head tilt, placeholder talking mouth.
  Props: `url`, `state` ('idle' | 'thinking' | 'talking').
- components/AvatarStage.tsx: loads Avatar with next/dynamic (ssr: false), three temporary
  state buttons.
- app/page.tsx renders AvatarStage full-height.
- public/avatar.vrm: D.I.K.S.H.A, made in VRoid Studio (long dark hair, white dress).
  11.5 MB; target is under 5 MB, so re-export with polygon and material reduction later.
  public/avatar-blazer.vrm is the navy blazer variant; public/avatar-sample.vrm is the
  three-vrm sample model.

## Constraints

- Lazy-load the model; fall back to a 2D version on weak phones.
- Rate-limit per IP and cache common answers to control LLM and TTS cost.
- Browsers block audio until a click or key press. On the public page the intro starts by
  itself anyway, as silent captions, and her voice joins on the first interaction.
- Visitor mode always keeps a plain "skip to projects" link.

## Progress log

- Step 1 done: app/api/chat/route.ts streams Claude (model from DIKSHA_MODEL, default haiku),
  lib/persona.ts holds her prompt, components/AvatarStage.tsx has the chat UI.
- Step 2 first pass: hands-free voice loop in AvatarStage.tsx using lib/speech.ts.
  Listening = Web Speech API (Chrome/Edge), speaking = browser speechSynthesis, sentence by
  sentence as the reply streams. Mouth still uses the placeholder animation because browser
  voices expose no audio to analyse. Next: swap in a TTS API that returns audio for a natural
  voice and real lip sync, and add barge-in (interrupting her by speaking).
- Voice upgrade: lib/voice.ts plays ElevenLabs audio from app/api/tts/route.ts (needs
  ELEVENLABS_API_KEY) with volume-driven lip sync, falling back to the browser voice.
- Camera first pass (step 6, done early): "Open eyes" button in AvatarStage.tsx turns on the
  webcam; one 512px JPEG frame is attached to each user message while it's on. Her eyes track
  the 3D camera via vrm.lookAt. Not continuous video.
- Body language: components/Avatar.tsx is fully procedural (no animation files). Idle weight
  shift and breathing, listening lean and nods, thinking look-away, talking hand movement tied
  to voice volume, eye darts, and one-shot gestures (nod, shake, wave, shrug, tilt). Facial
  emotions use the VRM presets. The model drives them with tags like [happy] or [wave] in its
  reply (see lib/persona.ts); lib/cues.ts parses and strips them. Framing is now waist-up.
  The gesture/emotion chips in AvatarStage.tsx (top-left) are for tuning; remove when done.
- Decision (5 Oct): Akash wants D.I.K.S.H.A fully completed before the portfolio cut.
- Memory (step 3): lib/memory.ts stores short facts in data/memory.json (git-ignored).
  app/api/memory/route.ts: GET list, DELETE one or all, POST learns from the last exchange
  with a second Claude call that returns {add, remove}. Facts are appended to her system
  prompt in the chat route. Memory panel (top-right) lists and deletes them. Memory routes
  return 403 in production until login exists.

## Still to do before she counts as complete

1. ElevenLabs key in .env.local (natural voice + real lip sync; code is ready)
2. Interrupting her by speaking (barge-in) and faster first response
3. Initiative: greets on load, follow-up questions, notices return via camera
4. Tools with confirmation (reminders, notes, open links, search)
5. Recorded animation clips (Mixamo) for poses code can't do
6. Slim avatar.vrm under 5 MB; remove the tuning chips
7. Login and locking down owner mode
- Voice fix (5 Oct): ElevenLabs free plan rejects library voices over the API (402
  paid_plan_required), so the old default "Rachel" silently fell back to the browser voice.
  Default is now "Sarah" (EXAVITQu4vr4xnSDxMaL); Lily, Jessica, Laura, Alice also work free.
  Lip sync now uses three mouth shapes (aa, ee, oh) from the audio's volume and frequency
  balance (lib/voice.ts lips()). Camera moved closer so the face reads; expressions stronger.
- Lip sync v3 (5 Oct): app/api/tts/route.ts now calls ElevenLabs /with-timestamps and
  returns { audio (base64), alignment }. lib/visemes.ts maps each letter's timing to the five
  VRM mouth shapes (aa, ih, ou, ee, oh; m/b/p close the lips). lib/voice.ts plays the clip,
  picks the shape for the current instant and scales it by loudness. Voice panel (top-right)
  picks one of the free voices and a softness level (slower pace, quieter, high-shelf cut);
  saved in localStorage under "diksha-voice".

## Pivot (5 Oct, evening): voice-only, no character

Akash dropped the 3D character. D.I.K.S.H.A is now a voice assistant in the spirit of
sci-fi AI companions, shown as an original audio-reactive ring of light (not a copy of any
film design). Anything above about the avatar, VRoid, lip sync, gestures or expressions is
history. Current layout:

- app/page.tsx -> components/Assistant.tsx (voice loop, chat, camera, memory and voice panels)
- components/Presence.tsx: canvas ring; colour and motion per state (idle, listening,
  thinking, talking), driven by her real voice loudness via Speaker.energy()
- lib/voice.ts: ElevenLabs audio with softness (pace, volume, high-shelf cut), browser
  voice fallback. app/api/tts/route.ts streams plain audio again (no timestamps).
- lib/speech.ts, lib/memory.ts, lib/persona.ts, app/api/chat, app/api/memory: unchanged roles
- _archive/: the retired avatar code (excluded from tsc and eslint)
- Leftovers safe to remove: public/*.vrm, and the three, @react-three/fiber,
  @pixiv/three-vrm, @types/three packages

## Visitor mode (5 Oct, night)

- `/` is now the public portfolio: components/Guide.tsx (her greeting, recorded intro,
  captions, project cards that appear as she speaks, live questions) above plain sections
  rendered in app/page.tsx. `/owner` is the private assistant (404 in production).
- content/portfolio.ts holds every fact she may tell visitors, the intro script, and the
  suggested questions. It is a DRAFT until Akash checks it; links and email are empty.
  SENTINEL and ProcessIQ are unpublished.
- app/api/guide: visitor chat (visitorPrompt in lib/persona.ts, no memory, no camera, rate
  limited). She writes [[show:id]] to put a project card on screen.
- app/api/intro/[index]: records each intro line once into public/intro/N.mp3 (dev only),
  re-records if the line or voice changes; in production it redirects to the static file.
  Commit public/intro before deploying.
- lib/limits.ts: ownerOnly() for /api/chat and /api/memory, and an in-memory rate limit
  (replace with a shared store on serverless hosting). lib/elevenlabs.ts: shared TTS call.
- Still open: Akash to verify content, add links/email/contact, play the intro once to
  record all lines, mobile check, deploy, and login for /owner.
- Entrance (5 Oct): Presence draws the ring in over 1.8s and stays dim ("dormant") until
  the visitor's first click. On "Meet Akash" she wakes: brightens, sends out two bursts of
  light, and lib/sounds.ts plays a synthesized wake sound (no audio file); the intro speech
  starts 1.1s later. Name letters and buttons fade in on a stagger. Reduced-motion users
  skip the draw-in and bursts.

## Fixes and auto-intro (25 Oct)

- Presence is now components/ThreeDPresence.tsx (Three.js core, 2D ring fallback without
  WebGL); components/Presence.tsx is unused. lib/emotion.ts (face-api.js + tfjs) reads the
  owner's expression every 4s while the camera is on; /api/chat accepts only the 7 known labels.
  Models still load from justadudewhohacks.github.io: host them under public/ before launch.
- Barge-in works in Assistant.tsx: the mic stays open while she speaks; two words (or a final
  phrase) that aren't her own reply echoing back stop her and cancel the stream.
- Auto-intro (Guide.tsx): 1.6s after load she runs the intro line by line. If the browser
  already allows sound she speaks; otherwise lines show as captions timed to reading speed with
  a "Tap anywhere to hear her" hint, and the first tap/key replays the current line out loud and
  continues with voice. No "Meet Akash" button and no typed greeting any more. Speaker.enqueue
  returns a promise per line.
- The public page no longer links to /owner.

## Presence v3 (25 Oct)

- components/CoreScene.tsx (lazy-loaded by ThreeDPresence; 2D ring shows while it loads or
  without WebGL): custom shaders in components/coreShaders.ts. Plasma orb (noise-displaced
  icosahedron, fresnel rim, drifting veins), three orbits with comets of light, 1800 GPU dust
  specks, a halo, and a two-ring shockwave on wake. Bloom via @react-three/postprocessing
  3.1.3 + postprocessing 6.39.5 (pinned). All motion is driven by one per-frame `step()`;
  reduced motion slows everything to 35%. Camera auto-fits FIT_RADIUS to the canvas; a
  circular CSS mask fades the canvas edge. Shared types/HUES live in lib/presence.ts.
- Hero styling in app/globals.css: --accent-h follows her state hue (registered with
  @property so it animates); dot grid, glowing name/status/caption, .glass-btn, .glass-input,
  .glass-card (also used by the cards lower on the page). Body font is now Geist.
- Captions reveal word by word (components/Caption.tsx), paced to each recorded line.
- Backdrop (components/Backdrop.tsx + .backdrop styles), themed as a neural interface:
  a 2D-canvas network whose signals hop node to node (firing rate follows her state and
  voice; paused when scrolled away), a perspective grid floor with horizon line, a HUD ring
  around her (HudRing, inside .presence-stage), corner readouts with only true facts
  (name, live state, Claude, ElevenLabs; bottom pair hidden under 640px), a scan sweep,
  grain and vignette. The 3D canvas is black with mix-blend-mode screen so only her light
  lands on the backdrop.

## Awwwards pass (25 Oct)

- Boot screen (components/Boot.tsx): real loading steps (CoreScene import, fonts), counter,
  then "Enter with sound" / "Enter without sound" / "Skip to projects"; enters silently on
  its own after 7s. Entry modes in Guide.tsx: 'sound' unlocks audio in the click; 'silent'
  stays silent until the visitor presses "Turn on sound" or "Talk to me"; 'auto' keeps the
  tap-anywhere unlock. Hero animations (.hold-until-live) wait for entry. The old 1.6s
  auto-start is gone; the boot screen is now the start of the intro.
- Custom cursor + data-magnetic (components/Cursor.tsx), fine pointers only.
- app/page.tsx redesigned: numbered sections ([01] About ... [05] Contact), word-by-word
  headline reveals and fade-ups via data-reveal (components/ScrollFX.tsx), skills marquee,
  project rows with live miniatures (components/ProjectVisual.tsx, labelled LIVE MINIATURE,
  not screenshots), capabilities grid, animated pipeline + facts, "Let's talk." contact with
  orb button, footer with live IST clock. Display font Unbounded (--font-display).
- app/icon.svg replaces the default favicon (app/favicon.ico deleted, not yet committed).
- Before submitting to Awwwards: real email/links in content/portfolio.ts, verify every
  fact, real project links/screens if possible, an OG image, deploy (login for /owner).

## 4D experiment (25 Oct)

- Tried a tesseract rotating in 4D in place of the orbit rings; Akash didn't like the look,
  so it was removed and the three orbits are back. Kept from it: the horizon line sits at 22%
  and is masked out behind her so it no longer cuts the core.
- 4D plasma (kept): the orb samples 4D simplex noise (noise4 in coreShaders.ts) at
  (surface point, uFlow), so the plasma and veins change in place instead of sliding across
  the surface. uFlow = time * 0.3 + phase * 1.2, so it boils faster while she thinks or talks.
  The veins are domain-warped by two more 4D noise samples so they curl.

## Portrait (25 Oct)

- public/akash.webp (1086x1448) sits in [01] About, left of the summary and facts
  (.portrait in globals.css): next/image, cropped head-to-knees with a scale transform, HUD
  corner brackets, a slow scan line, bottom fade into the page, and a clip-path wipe on reveal.
  Stacks above the text under 900px. Reduced motion turns off the wipe and scan.

## Contact (26 Oct)

- content/portfolio.ts now has Akash's real email, phone (+91), GitHub and LinkedIn; she can
  share them (contact line in visitorPrompt includes phone).
- Contact form (components/ContactForm.tsx -> app/api/contact/route.ts): name, email, optional
  company, message, hidden honeypot field. 3 messages per visitor per hour (in-memory tooMany).
  Sends via Resend's REST API when RESEND_API_KEY is set (reply-to = visitor); otherwise dev
  saves to data/messages.json and production answers 503 with the email address.
  Free Resend sender onboarding@resend.dev only delivers to the Resend account's own email.

## Deployed (26 Oct)

- Vercel project akash-portfolio (team akash-kumar-singhs-projects-fcf110d0), live at
  https://akash-portfolio-eta-snowy.vercel.app. Linked to github.com/Akashkr28/D.I.K.S.H.A,
  so pushes deploy. First deploy was from the CLI (vercel deploy --prod); .vercelignore keeps
  .env*, data/, *.vrm and _archive/ out of uploads.
- lib/limits.ts tooMany() is async and uses Upstash Redis (UPSTASH_REDIS_REST_* or KV_REST_API_*)
  when set, memory otherwise.
- Env vars still to add in Vercel: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, RESEND_API_KEY,
  Upstash (Storage tab). Until then /api/guide answers 503 and the form says email instead.
