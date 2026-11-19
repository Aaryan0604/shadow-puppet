/**
 * On-device pose tracking with MediaPipe Pose (lite model). All model + wasm files are
 * shipped in /mp/pose, so nothing is fetched from a third party and no video leaves the tab.
 *
 * The legacy MediaPipe build is a classic script (it attaches `Pose` to window), so we load it
 * with a script tag rather than a bundler import.
 */

export interface Landmark { x: number; y: number; z: number; visibility?: number }
export type Landmarks = Landmark[]

interface PoseInstance {
  setOptions(o: Record<string, unknown>): void
  onResults(cb: (r: { poseLandmarks?: Landmarks }) => void): void
  initialize(): Promise<void>
  send(i: { image: HTMLVideoElement }): Promise<void>
  close(): Promise<void>
}
declare global {
  interface Window { Pose?: new (cfg: { locateFile: (f: string) => string }) => PoseInstance }
}

const BASE = './mp/pose/'

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Pose) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load pose runtime'))
    document.head.appendChild(s)
  })
}

export interface PoseSession {
  video: HTMLVideoElement
  stop(): void
}

export async function startPose(onLandmarks: (lm: Landmarks | null) => void): Promise<PoseSession> {
  await loadScript(BASE + 'pose.js')
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  })
  const video = document.createElement('video')
  video.playsInline = true
  video.muted = true
  video.srcObject = stream
  await video.play()

  const pose = new window.Pose!({ locateFile: (f) => BASE + f })
  pose.setOptions({ modelComplexity: 0, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 })
  pose.onResults((r) => onLandmarks(r.poseLandmarks ?? null))
  await pose.initialize()

  let running = true
  let busy = false
  const tick = async () => {
    if (!running) return
    if (!busy && video.readyState >= 2) {
      busy = true
      try { await pose.send({ image: video }) } catch { /* drop a frame */ }
      busy = false
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return {
    video,
    stop() {
      running = false
      stream.getTracks().forEach((t) => t.stop())
      pose.close().catch(() => {})
    },
  }
}
