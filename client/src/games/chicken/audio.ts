// Procedural sound for Chicken Royale: every effect is synthesised with the Web Audio API, so there are no audio files
// to download. The context only starts after a click (browser autoplay rules), and M mutes it.
type Spatial = { gain: number; pan: number }

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  muted = false

  // must be called from a user gesture
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.7
      this.master.connect(this.ctx.destination)
      const len = this.ctx.sampleRate * 2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this.startAmbient()
    }
    void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05)
  }

  private get on() { return !!this.ctx && this.ctx.state === 'running' && !this.muted }

  private out(pan: number): AudioNode {
    const ctx = this.ctx!
    if (!ctx.createStereoPanner) return this.master!
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(this.master!)
    return p
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, s: Spatial, opts: { to?: number; delay?: number; vibrato?: number; lowpass?: number } = {}) {
    if (!this.on || s.gain < 0.02) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur)
    const g = ctx.createGain()
    const peak = gain * s.gain
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    let node: AudioNode = osc
    if (opts.lowpass) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass
      node.connect(f); node = f
    }
    node.connect(g)
    g.connect(this.out(s.pan))
    if (opts.vibrato) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 28
      const lg = ctx.createGain(); lg.gain.value = opts.vibrato
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur)
    }
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  private noise(dur: number, gain: number, s: Spatial, opts: { type?: BiquadFilterType; from: number; to?: number; delay?: number; q?: number }) {
    if (!this.on || s.gain < 0.02) return
    const ctx = this.ctx!
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = opts.type ?? 'bandpass'
    f.Q.value = opts.q ?? 1
    f.frequency.setValueAtTime(opts.from, t0)
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur)
    const g = ctx.createGain()
    const peak = gain * s.gain
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f); f.connect(g); g.connect(this.out(s.pan))
    src.start(t0, Math.random())
    src.stop(t0 + dur + 0.05)
  }

  private startAmbient() {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420
    const g = ctx.createGain(); g.gain.value = 0.05
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18
    const lg = ctx.createGain(); lg.gain.value = 0.025
    lfo.connect(lg); lg.connect(g.gain); lfo.start()
    src.connect(f); f.connect(g); g.connect(this.master!)
    src.start()
    this.ambient = { src, gain: g }
  }

  // ---- effects (s = loudness / pan from where it happened relative to the listener)
  throw(s: Spatial) {
    this.noise(0.14, 0.35, s, { from: 1400, to: 380, q: 1.2 })
    this.tone(520, 0.1, 'square', 0.05, s, { to: 220 })
  }
  hit(s: Spatial) { this.bawk(s, 1); this.noise(0.05, 0.2, s, { type: 'highpass', from: 2500 }) }
  bawk(s: Spatial, pitch: number) {
    this.tone(520 * pitch, 0.16, 'sawtooth', 0.18, s, { to: 300 * pitch, vibrato: 40, lowpass: 1900 })
    this.tone(780 * pitch, 0.1, 'triangle', 0.08, s, { to: 420 * pitch, delay: 0.04 })
  }
  splat(s: Spatial) {
    this.noise(0.11, 0.3, s, { type: 'lowpass', from: 700, to: 200 })
    this.tone(220, 0.1, 'sine', 0.2, s, { to: 80 })
  }
  boom(s: Spatial) {
    this.noise(0.55, 0.7, s, { type: 'lowpass', from: 1000, to: 70, q: 0.7 })
    this.tone(95, 0.45, 'sine', 0.55, s, { to: 30 })
  }
  pickup(s: Spatial) {
    this.tone(880, 0.12, 'sine', 0.2, s)
    this.tone(1320, 0.18, 'sine', 0.2, s, { delay: 0.08 })
    this.tone(1760, 0.22, 'sine', 0.14, s, { delay: 0.16 })
  }
  splash(s: Spatial) { this.noise(0.45, 0.45, s, { from: 1800, to: 500, q: 0.8 }) }
  cooked(s: Spatial) {
    this.bawk(s, 0.75)
    this.noise(0.5, 0.18, s, { type: 'highpass', from: 3000, q: 0.5, delay: 0.1 })
  }
  tick(high = false) {
    const s = { gain: 1, pan: 0 }
    this.tone(high ? 990 : 660, high ? 0.25 : 0.1, 'sine', 0.22, s)
  }
  lowHealth() { this.tone(120, 0.14, 'sine', 0.3, { gain: 1, pan: 0 }) }

  dispose() {
    try { this.ambient?.src.stop() } catch { /* already stopped */ }
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
