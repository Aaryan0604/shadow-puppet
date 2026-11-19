import { useEffect, useRef, type ReactNode } from 'react'
import { animate, createTimeline } from 'animejs'
import BlurText from './reactbits/BlurText'

interface Props {
  open: boolean
  loading: boolean
  onCamera: () => void
  onDemo: () => void
  note?: string | null
  children?: ReactNode
}

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Curtain({ open, loading, onCamera, onDemo, note }: Props) {
  const left = useRef<HTMLDivElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useEffect(() => {
    const L = left.current!, R = right.current!, C = copy.current!
    if (first.current) { first.current = false; if (!open) return }
    if (reduce()) {
      L.style.transform = open ? 'translateX(-101%)' : 'none'
      R.style.transform = open ? 'translateX(101%)' : 'none'
      C.style.opacity = open ? '0' : '1'
      return
    }
    const tl = createTimeline({ defaults: { ease: 'inOutQuart' } })
    if (open) {
      tl.add(C, { opacity: 0, y: -14, duration: 450, ease: 'outQuad' })
        .add(L, { x: '-101%', duration: 1900 }, 250)
        .add(R, { x: '101%', duration: 1900 }, 250)
    } else {
      tl.add(L, { x: '0%', duration: 1300 })
        .add(R, { x: '0%', duration: 1300 }, 0)
        .add(C, { opacity: 1, y: 0, duration: 700, ease: 'outQuad' }, 900)
    }
    return () => { tl.pause() }
  }, [open])

  useEffect(() => {
    if (!loading || reduce()) return
    const a = animate('[data-dot]', { opacity: [0.15, 1], duration: 500, alternate: true, loop: true, delay: (_: unknown, i?: number) => (i ?? 0) * 160, ease: 'inOutSine' })
    return () => { a.pause() }
  }, [loading])

  return (
    <div className="pointer-events-none fixed inset-0 z-20" aria-hidden={open}>
      <div ref={left} className="pleats pointer-events-auto absolute inset-y-0 left-0 w-1/2 will-change-transform" style={{ transform: open ? 'translateX(-101%)' : undefined }} />
      <div ref={right} className="pleats pointer-events-auto absolute inset-y-0 right-0 w-1/2 will-change-transform" style={{ transform: open ? 'translateX(101%)' : undefined }} />
      <div ref={copy} className={`absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white ${open ? 'pointer-events-none opacity-0' : 'pointer-events-auto'}`}>
        <h1 className="font-display text-[clamp(4rem,17vw,13rem)] leading-[0.86] tracking-tight">
          <span className="block"><BlurText text="Shadow" delay={70} animateBy="letters" direction="top" trigger="load" /></span>
          <span className="block italic"><BlurText text="Puppet" delay={70} animateBy="letters" direction="bottom" trigger="load" /></span>
        </h1>
        <p className="mt-8 max-w-md text-[15px] leading-relaxed text-white/60">
          Your webcam becomes the puppeteer. A hand-cut figure copies every move you make. Pose tracking runs on this device, and nothing is recorded or sent anywhere.
        </p>
        <div className="mt-10 flex h-16 flex-col items-center gap-3 text-lg">
          {loading ? (
            <p className="font-display text-2xl italic text-white/80" role="status">
              waking the puppet<span data-dot>.</span><span data-dot>.</span><span data-dot>.</span>
            </p>
          ) : (
            <>
              <button className="tlink text-xl" onClick={onCamera}>Raise the curtain</button>
              <button className="tlink text-sm text-white/50 hover:text-white" onClick={onDemo}>no camera? watch it on autopilot</button>
            </>
          )}
        </div>
        {note && <p className="mt-6 max-w-sm text-sm text-white/55" role="alert">{note}</p>}
      </div>
    </div>
  )
}
