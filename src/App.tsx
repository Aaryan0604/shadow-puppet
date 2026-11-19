import { useCallback, useEffect, useRef, useState } from 'react'
import { animate } from 'animejs'
import { Stage } from './components/Stage'
import { Curtain } from './components/Curtain'
import Noise from './components/reactbits/Noise'
import { startPose, type Landmarks, type PoseSession } from './lib/poseRunner'

type Phase = 'intro' | 'loading' | 'open'

export default function App() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [mode, setMode] = useState<'camera' | 'demo'>('demo')
  const [note, setNote] = useState<string | null>(null)
  const [caption, setCaption] = useState<string | null>(null)
  const landmarks = useRef<Landmarks | null>(null)
  const aspect = useRef(4 / 3)
  const session = useRef<PoseSession | null>(null)
  const captionEl = useRef<HTMLParagraphElement>(null)
  const seenFirst = useRef(false)

  const stopCamera = useCallback(() => { session.current?.stop(); session.current = null; landmarks.current = null; seenFirst.current = false }, [])

  const startDemo = useCallback((msg?: string) => {
    stopCamera()
    setMode('demo'); setPhase('open')
    setCaption(msg ?? "Autopilot. I'll keep dancing until you take the strings.")
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    setNote(null); setPhase('loading')
    try {
      stopCamera()
      session.current = await startPose((lm) => {
        landmarks.current = lm
        if (lm && !seenFirst.current) {
          seenFirst.current = true
          const v = session.current?.video
          if (v && v.videoWidth) aspect.current = v.videoWidth / v.videoHeight
          setMode('camera'); setPhase('open')
          setCaption("You're the puppeteer. Step back until your shoulders are in frame.")
        }
      })
      // If nobody is in view yet, open anyway after a moment so the page never feels stuck.
      window.setTimeout(() => {
        if (!seenFirst.current && session.current) {
          seenFirst.current = true
          const v = session.current.video
          if (v.videoWidth) aspect.current = v.videoWidth / v.videoHeight
          setMode('camera'); setPhase('open')
          setCaption("I can't see you yet. Step back until your shoulders are in frame.")
        }
      }, 4000)
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')
      setPhase('intro')
      setNote(denied ? 'No camera access, so you can watch the autopilot instead.' : "The pose tracker couldn't start on this browser. Try the autopilot instead.")
    }
  }, [stopCamera])

  const closeCurtain = useCallback(() => { stopCamera(); setCaption(null); setPhase('intro') }, [stopCamera])

  useEffect(() => () => stopCamera(), [stopCamera])

  // Captions fade in, linger, then fade out.
  useEffect(() => {
    const el = captionEl.current
    if (!caption || !el) return
    el.style.opacity = '0'
    const a = animate(el, { opacity: [0, 1, 1, 0], y: [8, 0, 0, -4], duration: 7000, delay: 1800, ease: 'linear' })
    return () => { a.pause() }
  }, [caption])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#bdbdbd] text-black">
      <Stage mode={mode} landmarks={landmarks} aspect={aspect} paused={phase !== 'open'} />
      <Noise opacity={0.16} blendMode="multiply" fps={14} />

      <div className={`absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-8 transition-opacity duration-700 ${phase === 'open' ? 'opacity-100' : 'opacity-0'}`}>
        <p className="font-display text-2xl leading-none">Shadow <span className="italic">Puppet</span></p>
      </div>

      <p ref={captionEl} className="pointer-events-none absolute left-5 top-[4.25rem] z-10 max-w-[15rem] text-left font-display text-xl italic leading-snug opacity-0 sm:left-8 sm:max-w-xs sm:text-2xl" role="status">
        {caption}
      </p>

      <div className={`absolute inset-x-0 bottom-0 z-10 flex items-center justify-between p-5 text-sm sm:p-8 transition-opacity duration-700 ${phase === 'open' ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {mode === 'demo'
          ? <button className="tlink" onClick={startCamera}>take the strings (use my camera)</button>
          : <button className="tlink" onClick={() => startDemo()}>switch to autopilot</button>}
        <button className="tlink" onClick={closeCurtain}>close the curtain</button>
      </div>

      <Curtain open={phase === 'open'} loading={phase === 'loading'} onCamera={startCamera} onDemo={() => startDemo()} note={note} />
    </div>
  )
}
