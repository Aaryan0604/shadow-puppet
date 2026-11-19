import type { Landmarks } from './poseRunner'

interface V { x: number; y: number }
const v = (x = 0, y = 0): V => ({ x, y })
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }

/** Critically damped spring (Unity-style SmoothDamp): follows a target without overshoot. */
class Spring {
  p: V; vel: V = v()
  constructor(p: V) { this.p = { ...p } }
  step(t: V, smooth: number, dt: number) {
    const w = 2 / smooth, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
    for (const k of ['x', 'y'] as const) {
      const ch = this.p[k] - t[k], tmp = (this.vel[k] + w * ch) * dt
      this.vel[k] = (this.vel[k] - w * tmp) * e
      this.p[k] = t[k] + (ch + tmp) * e
    }
  }
}

interface Leg { a1: number; w1: number; a2: number; w2: number }

export class Puppet {
  head = new Spring(v(0, 0)); neck = new Spring(v()); hipC = new Spring(v())
  ls = new Spring(v()); rs = new Spring(v()); le = new Spring(v()); re = new Spring(v())
  lw = new Spring(v()); rw = new Spring(v()); lk = new Spring(v()); rk = new Spring(v())
  la = new Spring(v()); ra = new Spring(v())
  headR = 40; unit = 100 // unit = shoulder width in px; everything scales from it
  legs: [Leg, Leg] = [{ a1: 0, w1: 0, a2: 0, w2: 0 }, { a1: 0, w1: 0, a2: 0, w2: 0 }]
  legsTracked = false
  lastHipVelX = 0
  hasPose = false
  lostFor = 0
  trails: { x: number; y: number; t: number }[][] = [[], []]
  private inited = false

  /** Feed the latest landmarks (or null when nobody is detected). */
  update(lm: Landmarks | null, dt: number, W: number, H: number, aspect: number, now: number) {
    dt = clamp(dt, 0.001, 0.05)
    const s = Math.min(H, W / aspect) * 0.86
    const P = (i: number): V & { vis: number } => ({
      x: W / 2 + (0.5 - lm![i].x) * s * aspect,
      y: H / 2 + (lm![i].y - 0.5) * s,
      vis: lm![i].visibility ?? 1,
    })

    let T: Record<string, V>
    let unit = this.unit
    let headR = this.headR
    let legTargets: { lk: V; rk: V; la: V; ra: V } | null = null

    if (lm && lm.length >= 29 && P(11).vis > 0.4 && P(12).vis > 0.4) {
      this.hasPose = true; this.lostFor = 0
      const L = P(11), R = P(12)
      const neck = v((L.x + R.x) / 2, (L.y + R.y) / 2)
      unit = clamp(Math.hypot(L.x - R.x, L.y - R.y), H * 0.12, H * 0.5)
      const nose = P(0), eL = P(7), eR = P(8)
      const earsOk = eL.vis > 0.4 && eR.vis > 0.4
      const head = earsOk ? v((nose.x * 2 + eL.x + eR.x) / 4, (nose.y * 2 + eL.y + eR.y) / 4) : v(nose.x, nose.y - unit * 0.02)
      headR = earsOk ? clamp(Math.hypot(eL.x - eR.x, eL.y - eR.y) * 0.62, unit * 0.22, unit * 0.5) : unit * 0.34
      const hl = P(23), hr = P(24)
      const hipsOk = hl.vis > 0.55 && hr.vis > 0.55
      const down = unit * 1.35
      const lh = hipsOk ? v(hl.x, hl.y) : v(neck.x + (L.x - neck.x) * 0.62, neck.y + down)
      const rh = hipsOk ? v(hr.x, hr.y) : v(neck.x + (R.x - neck.x) * 0.62, neck.y + down)
      const elb = (i: number, _sh: V, fallback: V) => (P(i).vis > 0.3 ? v(P(i).x, P(i).y) : fallback)
      T = {
        head, neck, ls: v(L.x, L.y), rs: v(R.x, R.y), lh, rh,
        le: elb(13, L, v(L.x, L.y + unit * 0.9)), re: elb(14, R, v(R.x, R.y + unit * 0.9)),
        lw: elb(15, L, v(L.x, L.y + unit * 1.7)), rw: elb(16, R, v(R.x, R.y + unit * 1.7)),
      }
      if (P(25).vis > 0.6 && P(26).vis > 0.6 && P(27).vis > 0.5 && P(28).vis > 0.5) {
        legTargets = { lk: v(P(25).x, P(25).y), rk: v(P(26).x, P(26).y), la: v(P(27).x, P(27).y), ra: v(P(28).x, P(28).y) }
      }
    } else {
      // Nobody in frame: the puppet slumps into a limp rest pose at the centre.
      this.lostFor += dt
      const c = v(W / 2, H * 0.42), u = Math.min(H * 0.2, W * 0.28)
      unit = u; headR = u * 0.34
      const droop = Math.min(1, this.lostFor / 1.2) * u * 0.12
      T = {
        head: v(c.x, c.y - u * 0.62 + droop), neck: v(c.x, c.y + droop * 0.4),
        ls: v(c.x - u / 2, c.y + droop * 0.4), rs: v(c.x + u / 2, c.y + droop * 0.4),
        lh: v(c.x - u * 0.3, c.y + u * 1.35), rh: v(c.x + u * 0.3, c.y + u * 1.35),
        le: v(c.x - u * 0.62, c.y + u * 0.9), re: v(c.x + u * 0.62, c.y + u * 0.9),
        lw: v(c.x - u * 0.7, c.y + u * 1.5), rw: v(c.x + u * 0.7, c.y + u * 1.5),
      }
    }

    if (!this.inited) {
      for (const k of ['head', 'neck', 'ls', 'rs', 'le', 're', 'lw', 'rw'] as const) this[k] = new Spring(T[k])
      this.hipC = new Spring(v((T.lh.x + T.rh.x) / 2, (T.lh.y + T.rh.y) / 2))
      this.inited = true
    }
    this.unit += (unit - this.unit) * Math.min(1, dt * 4)
    this.headR += (headR - this.headR) * Math.min(1, dt * 6)

    this.head.step(T.head, 0.09, dt); this.neck.step(T.neck, 0.08, dt)
    this.ls.step(T.ls, 0.07, dt); this.rs.step(T.rs, 0.07, dt)
    this.le.step(T.le, 0.07, dt); this.re.step(T.re, 0.07, dt)
    this.lw.step(T.lw, 0.06, dt); this.rw.step(T.rw, 0.06, dt)
    this.hipC.step(v((T.lh.x + T.rh.x) / 2, (T.lh.y + T.rh.y) / 2), 0.14, dt)

    // Legs: tracked when the camera sees them, otherwise they dangle like a marionette's.
    this.legsTracked = !!legTargets
    const hipX = this.hipC.p.x
    const accel = (this.hipC.vel.x - this.lastHipVelX) / dt
    this.lastHipVelX = this.hipC.vel.x
    for (let i = 0; i < 2; i++) {
      const g = this.legs[i]
      const drive = clamp(-accel * 0.00055, -6, 6)
      const w0 = 7.5 + i * 0.9
      g.w1 += (-w0 * w0 * g.a1 - 2 * 0.28 * w0 * g.w1 + drive) * dt
      g.a1 = clamp(g.a1 + g.w1 * dt, -1.1, 1.1)
      const w1b = 11 + i
      g.w2 += (-w1b * w1b * (g.a2 - g.a1 * 0.4) - 2 * 0.22 * w1b * g.w2 + drive * 0.8) * dt
      g.a2 = clamp(g.a2 + g.w2 * dt, -1.4, 1.4)
    }
    const hipSep = Math.abs(T.lh.x - T.rh.x) / 2 || this.unit * 0.2
    const hl = v(hipX - hipSep, this.hipC.p.y), hr = v(hipX + hipSep, this.hipC.p.y)
    const th = this.unit * 0.82, sh = this.unit * 0.8
    const swing = (h: V, g: Leg) => {
      const k = v(h.x + Math.sin(g.a1) * th, h.y + Math.cos(g.a1) * th)
      const a = v(k.x + Math.sin(g.a1 + g.a2 * 0.7) * sh, k.y + Math.cos(g.a1 + g.a2 * 0.7) * sh)
      return { k, a }
    }
    const l = swing(hl, this.legs[0]), r = swing(hr, this.legs[1])
    const tgt = legTargets ?? { lk: l.k, rk: r.k, la: l.a, ra: r.a }
    const sm = legTargets ? 0.08 : 0.04
    if (!this.lk.p.x && !this.lk.p.y) { this.lk = new Spring(tgt.lk); this.rk = new Spring(tgt.rk); this.la = new Spring(tgt.la); this.ra = new Spring(tgt.ra) }
    this.lk.step(tgt.lk, sm, dt); this.rk.step(tgt.rk, sm, dt); this.la.step(tgt.la, sm, dt); this.ra.step(tgt.ra, sm, dt)

    // Ink trails from the wrists when they move fast.
    ;[this.lw.p, this.rw.p].forEach((p, i) => {
      const sp = Math.hypot(i ? this.rw.vel.x : this.lw.vel.x, i ? this.rw.vel.y : this.lw.vel.y)
      if (sp > this.unit * 1.6) this.trails[i].push({ x: p.x, y: p.y, t: now })
      const tr = this.trails[i]
      while (tr.length && now - tr[0].t > 1.6) tr.shift()
    })
  }

  /* ---------------- drawing ---------------- */

  draw(ctx: CanvasRenderingContext2D, now: number, W: number) {
    this.ctx = ctx
    const boil = Math.floor(now * 9) // hand-cut edges "boil" at ~9 fps like stop-motion
    const j = (i: number) => (hash(boil * 31 + i) - 0.5) * 1.8
    const u = this.unit, ink = '#0a0a0a'
    ctx.save()
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round'

    // ink trails
    for (const tr of this.trails) {
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i], age = (now - b.t) / 1.6
        ctx.globalAlpha = Math.max(0, 0.5 * (1 - age))
        ctx.lineWidth = u * 0.09 * (1 - age) + 1
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
    }
    ctx.globalAlpha = 1

    // control rods
    ctx.lineWidth = 1.5
    const rod = (p: V, k: number) => { ctx.beginPath(); ctx.moveTo(p.x + j(k), p.y); ctx.lineTo(p.x + (p.x - W / 2) * 0.07, -12); ctx.stroke() }
    rod(this.lw.p, 1); rod(this.rw.p, 2); rod(this.head.p, 3)

    // legs
    const wLeg = u * 0.2
    this.limb(v(this.hipC.p.x - u * 0.2, this.hipC.p.y), this.lk.p, wLeg, wLeg * 0.8, j(4), false)
    this.limb(v(this.hipC.p.x + u * 0.2, this.hipC.p.y), this.rk.p, wLeg, wLeg * 0.8, j(5), false)
    this.limb(this.lk.p, this.la.p, wLeg * 0.8, wLeg * 0.55, j(6), false)
    this.limb(this.rk.p, this.ra.p, wLeg * 0.8, wLeg * 0.55, j(7), false)
    this.foot(this.lk.p, this.la.p); this.foot(this.rk.p, this.ra.p)

    // torso
    this.torso(ctx, j)

    // arms
    const wA = u * 0.17
    this.limb(this.ls.p, this.le.p, wA, wA * 0.82, j(8), true)
    this.limb(this.rs.p, this.re.p, wA, wA * 0.82, j(9), true)
    this.limb(this.le.p, this.lw.p, wA * 0.82, wA * 0.6, j(10), true)
    this.limb(this.re.p, this.rw.p, wA * 0.82, wA * 0.6, j(11), true)
    for (const w of [this.lw.p, this.rw.p]) { ctx.beginPath(); ctx.ellipse(w.x, w.y, wA * 0.62, wA * 0.78, 0, 0, Math.PI * 2); ctx.fill() }

    // neck + head
    this.limb(this.neck.p, this.head.p, u * 0.2, u * 0.16, j(12), false)
    this.headShape(ctx, now, j)

    // brass pins at the joints
    const pins = [this.ls.p, this.rs.p, this.le.p, this.re.p, this.lk.p, this.rk.p, v(this.hipC.p.x - u * 0.2, this.hipC.p.y), v(this.hipC.p.x + u * 0.2, this.hipC.p.y)]
    for (const p of pins) {
      ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(p.x, p.y, u * 0.045, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(p.x, p.y, u * 0.016, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
  private ctx!: CanvasRenderingContext2D

  private limb(a: V, b: V, w0: number, w1: number, jit: number, perf: boolean) {
    const ctx = this.ctx
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L
    ctx.beginPath()
    ctx.moveTo(a.x + nx * w0 / 2 + jit, a.y + ny * w0 / 2)
    ctx.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2 + jit)
    ctx.lineTo(b.x - nx * w1 / 2, b.y - ny * w1 / 2)
    ctx.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2)
    ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.arc(a.x, a.y, w0 / 2, 0, Math.PI * 2); ctx.arc(b.x, b.y, w1 / 2, 0, Math.PI * 2); ctx.fill()
    if (perf && L > this.unit * 0.5) this.dots(a, b, w0)
  }
  /** punched "leather" perforations along a limb */
  private dots(a: V, b: V, w: number) {
    const ctx = this.ctx
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(L / (this.unit * 0.17))
    ctx.fillStyle = '#f4f4f4'
    for (let i = 1; i < n; i++) {
      const t = i / n
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, Math.max(1.1, w * 0.07), 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#0a0a0a'
  }
  private foot(k: V, a: V) {
    const ctx = this.ctx
    ctx.beginPath(); ctx.ellipse(a.x + this.unit * 0.07, a.y + this.unit * 0.02, this.unit * 0.16, this.unit * 0.07, Math.atan2(a.y - k.y, a.x - k.x) * 0.2, 0, Math.PI * 2); ctx.fill()
  }
  private torso(ctx: CanvasRenderingContext2D, j: (i: number) => number) {
    const u = this.unit, pad = u * 0.1
    const lh = v(this.hipC.p.x - u * 0.34, this.hipC.p.y), rh = v(this.hipC.p.x + u * 0.34, this.hipC.p.y)
    const A = v(this.ls.p.x - pad, this.ls.p.y - pad * 0.4), B = v(this.rs.p.x + pad, this.rs.p.y - pad * 0.4)
    ctx.beginPath()
    ctx.moveTo(A.x + j(20), A.y)
    ctx.quadraticCurveTo((A.x + B.x) / 2, A.y - u * 0.06, B.x, B.y + j(21))
    ctx.lineTo(rh.x + pad * 0.5, rh.y)
    ctx.quadraticCurveTo((lh.x + rh.x) / 2, rh.y + u * 0.12, lh.x - pad * 0.5, lh.y)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#f4f4f4'
    const rows = 7, cols = 6
    for (let r = 1; r < rows; r++) for (let c = 1; c < cols; c++) {
      if ((r + c) % 2) continue
      const tv = r / rows, tu = c / cols
      const top = v(A.x + (B.x - A.x) * tu, A.y + (B.y - A.y) * tu), bot = v(lh.x + (rh.x - lh.x) * tu, lh.y + (rh.y - lh.y) * tu)
      ctx.beginPath(); ctx.arc(top.x + (bot.x - top.x) * tv, top.y + (bot.y - top.y) * tv, u * 0.022, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#0a0a0a'
  }
  private headShape(ctx: CanvasRenderingContext2D, now: number, j: (i: number) => number) {
    const h = this.head.p, r = this.headR
    ctx.fillStyle = '#0a0a0a'
    // paper tuft
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(h.x + i * r * 0.34 - r * 0.14, h.y - r * 0.86); ctx.lineTo(h.x + i * r * 0.4 + j(30 + i) * 0.6, h.y - r * (1.38 - Math.abs(i) * 0.2)); ctx.lineTo(h.x + i * r * 0.34 + r * 0.14, h.y - r * 0.86); ctx.fill()
    }
    ctx.beginPath(); ctx.ellipse(h.x + j(31), h.y, r * 0.95, r, 0, 0, Math.PI * 2); ctx.fill()
    // look toward the higher hand
    const target = this.lw.p.y < this.rw.p.y ? this.lw.p : this.rw.p
    const ang = Math.atan2(target.y - h.y, target.x - h.x), look = r * 0.07
    const ex = r * 0.38, ey = -r * 0.08
    ctx.fillStyle = '#f4f4f4'
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(h.x + s * ex, h.y + ey, r * 0.19, r * 0.22, 0, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = '#0a0a0a'
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(h.x + s * ex + Math.cos(ang) * look, h.y + ey + Math.sin(ang) * look, r * 0.09, 0, Math.PI * 2); ctx.fill() }
    // mouth: "O" when a hand is above the head, a smile otherwise
    const excited = Math.min(this.lw.p.y, this.rw.p.y) < h.y - r * 0.6
    ctx.fillStyle = '#f4f4f4'; ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = Math.max(2, r * 0.07)
    if (excited) { ctx.beginPath(); ctx.ellipse(h.x, h.y + r * 0.46, r * 0.14, r * 0.2 + Math.sin(now * 14) * r * 0.02, 0, 0, Math.PI * 2); ctx.fill() }
    else { ctx.beginPath(); ctx.arc(h.x, h.y + r * 0.22, r * 0.34, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke() }
    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = '#0a0a0a'
  }
}

/** Scripted performance used as "autopilot" when there is no camera. Returns normalised landmarks. */
export function demoLandmarks(t: number): Landmarks {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }))
  const set = (i: number, x: number, y: number, vis = 1) => { lm[i] = { x, y, z: 0, visibility: vis } }
  const sm = (x: number) => x * x * (3 - 2 * x)
  const cheer = sm(clamp(Math.sin(t * 0.42) * 1.6 + 0.3, 0, 1))
  const cx = 0.5 + 0.045 * Math.sin(t * 0.55)
  const bob = 0.008 * Math.sin(t * 2.2)
  const sw = 0.095, sy = 0.5 + bob
  set(0, cx, 0.33 + bob); set(7, cx + 0.04, 0.335 + bob); set(8, cx - 0.04, 0.335 + bob)
  set(11, cx + sw, sy); set(12, cx - sw, sy)
  // arm A waves, arm B cycles between hanging, out and cheering
  const waveX = Math.sin(t * 3.4), waveY = Math.cos(t * 3.4)
  const wA = { x: cx + sw + 0.1 + 0.035 * waveX, y: sy - 0.2 + 0.03 * waveY }
  const hang = { x: cx - sw - 0.05 + 0.03 * Math.sin(t * 1.1), y: sy + 0.2 + 0.02 * Math.sin(t * 1.7) }
  const up = { x: cx - sw - 0.07 + 0.03 * Math.sin(t * 4), y: sy - 0.26 + 0.03 * Math.cos(t * 4) }
  const wB = { x: hang.x + (up.x - hang.x) * cheer, y: hang.y + (up.y - hang.y) * cheer }
  set(15, wA.x, wA.y); set(16, wB.x, wB.y)
  set(13, (cx + sw + wA.x) / 2 + 0.05, (sy + wA.y) / 2 + 0.02); set(14, (cx - sw + wB.x) / 2 - 0.05, (sy + wB.y) / 2 + 0.03)
  set(23, cx + 0.06, 0.8, 0.1); set(24, cx - 0.06, 0.8, 0.1)
  return lm
}
