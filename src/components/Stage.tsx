import { useEffect, useRef, type MutableRefObject } from 'react'
import { Puppet, demoLandmarks } from '../lib/puppet'
import type { Landmarks } from '../lib/poseRunner'

interface Props {
  mode: 'camera' | 'demo'
  landmarks: MutableRefObject<Landmarks | null>
  aspect: MutableRefObject<number>
  paused: boolean
}

export function Stage({ mode, landmarks, aspect, paused }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  const pausedRef = useRef(paused)
  modeRef.current = mode
  pausedRef.current = paused

  useEffect(() => {
    const cv = canvas.current!
    const ctx = cv.getContext('2d')!
    const puppet = new Puppet()
    let W = 0, H = 0, raf = 0, last = performance.now(), t0 = last

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      W = cv.clientWidth; H = cv.clientHeight
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame)
      if (pausedRef.current) { last = nowMs; return }
      const dt = (nowMs - last) / 1000; last = nowMs
      const now = (nowMs - t0) / 1000

      // the lit paper screen
      const g = ctx.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.75)
      const lamp = 0.985 + 0.015 * Math.sin(now * 7.3) * Math.sin(now * 2.1)
      g.addColorStop(0, `rgb(${Math.round(250 * lamp)},${Math.round(250 * lamp)},${Math.round(250 * lamp)})`)
      g.addColorStop(1, '#bdbdbd')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      const lm = modeRef.current === 'demo' ? demoLandmarks(now) : landmarks.current
      puppet.update(lm, dt, W, H, modeRef.current === 'demo' ? 4 / 3 : aspect.current, now)
      puppet.draw(ctx, now, W)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [landmarks, aspect])

  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="A shadow puppet mirroring your movements" role="img" />
}
