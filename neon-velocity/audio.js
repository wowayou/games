// ============================================================
//  audio.js —— Web Audio API 程序化合成：音乐、引擎与音效
//  无外部音频文件、零版权依赖
// ============================================================

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.running = false;
    this.nextBeat = 0;
    this.beat = 0;
    this.noiseBuffer = null;
  }

  async init() {
    if (!this.ctx) this.build();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.running = true;
    this.nextBeat = this.ctx.currentTime + 0.06;
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(c.destination);
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0.2; this.musicGain.connect(this.master);
    this.sfxGain = c.createGain(); this.sfxGain.gain.value = 0.44; this.sfxGain.connect(this.master);
    this.engineGain = c.createGain(); this.engineGain.gain.value = 0; this.engineGain.connect(this.master);

    // 引擎：锯齿基频 + 方波泛音，经低通滤波
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 1.1;
    this.engineFilter.connect(this.engineGain);
    this.engineOsc1 = c.createOscillator(); this.engineOsc1.type = 'sawtooth'; this.engineOsc1.frequency.value = 48;
    this.engineOsc2 = c.createOscillator(); this.engineOsc2.type = 'square'; this.engineOsc2.frequency.value = 96;
    const g1 = c.createGain(), g2 = c.createGain();
    g1.gain.value = 0.2; g2.gain.value = 0.05;
    this.engineOsc1.connect(g1).connect(this.engineFilter);
    this.engineOsc2.connect(g2).connect(this.engineFilter);
    this.engineOsc1.start(); this.engineOsc2.start();

    // 白噪声：军鼓 / 碰撞 / 氮气
    const len = Math.floor(c.sampleRate * 2);
    this.noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.boostNoise = c.createBufferSource();
    this.boostNoise.buffer = this.noiseBuffer;
    this.boostNoise.loop = true;
    this.boostFilter = c.createBiquadFilter();
    this.boostFilter.type = 'bandpass';
    this.boostFilter.frequency.value = 1250;
    this.boostGain = c.createGain(); this.boostGain.gain.value = 0;
    this.boostNoise.connect(this.boostFilter).connect(this.boostGain).connect(this.sfxGain);
    this.boostNoise.start();

    // 轮胎打滑
    this.slipNoise = c.createBufferSource();
    this.slipNoise.buffer = this.noiseBuffer;
    this.slipNoise.loop = true;
    this.slipFilter = c.createBiquadFilter();
    this.slipFilter.type = 'bandpass';
    this.slipFilter.frequency.value = 2600;
    this.slipFilter.Q.value = 4;
    this.slipGain = c.createGain(); this.slipGain.gain.value = 0;
    this.slipNoise.connect(this.slipFilter).connect(this.slipGain).connect(this.sfxGain);
    this.slipNoise.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  startRace() {
    if (!this.ctx) return;
    this.engineGain.gain.setTargetAtTime(0.3, this.ctx.currentTime, 0.25);
  }

  stopRace() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.03, t, 0.2);
    this.boostGain.gain.setTargetAtTime(0, t, 0.05);
    this.slipGain.gain.setTargetAtTime(0, t, 0.05);
  }

  /** 每帧：引擎随速度变调，模拟换挡 */
  update(speed, throttle, boosting, slip = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const abs = Math.abs(speed);
    const gear = Math.min(5, Math.floor(abs / 16));
    const inGear = (abs - gear * 16) / 16;
    const hz = 46 + gear * 9 + inGear * 78;
    this.engineOsc1.frequency.setTargetAtTime(hz, t, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(hz * 2.01, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(480 + abs * 22 + throttle * 780, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.15 + throttle * 0.15, t, 0.05);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.2 : 0, t, 0.03);
    this.slipGain.gain.setTargetAtTime(slip > 0.3 ? Math.min(0.17, slip * 0.2) : 0, t, 0.05);
    this.musicTick();
  }

  /** 提前调度的 16 分音符音序器（138 BPM，F 小调） */
  musicTick() {
    if (!this.running || !this.ctx) return;
    const c = this.ctx;
    const eighth = 60 / 138 / 2;
    while (this.nextBeat < c.currentTime + 0.12) {
      const step = this.beat % 32;
      if (step % 4 === 0) this.kick(this.nextBeat);
      if (step % 8 === 4) this.snare(this.nextBeat);
      this.hat(this.nextBeat, step % 2 ? 0.034 : 0.02);
      const bassLine = [43.65, 43.65, 58.27, 43.65, 65.41, 58.27, 38.89, 43.65];
      if (step % 2 === 0) this.bass(this.nextBeat, bassLine[(step / 2) % bassLine.length]);
      if (step >= 16 && step % 2 === 1) {
        const arp = [174.61, 207.65, 261.63, 311.13, 261.63, 207.65, 174.61, 155.56];
        this.synth(this.nextBeat, arp[((step - 17) / 2) | 0] ?? 174.61, eighth * 1.7, 0.03);
      }
      this.nextBeat += eighth;
      this.beat++;
    }
  }

  tone(time, freq, dur, type, gain, dest = this.sfxGain, sweep = null) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(12, sweep), time + dur);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + Math.min(0.014, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g).connect(dest);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  noise(t, dur, gain, filterHz, dest = this.sfxGain) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = filterHz; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t); s.stop(t + dur);
  }

  kick(t) {
    this.tone(t, 150, 0.17, 'sine', 0.5, this.musicGain, 44);
    this.tone(t, 56, 0.2, 'sine', 0.2, this.musicGain, 30);
  }
  snare(t) { this.noise(t, 0.13, 0.14, 1500, this.musicGain); this.tone(t, 175, 0.09, 'triangle', 0.09, this.musicGain, 96); }
  hat(t, gain) { this.noise(t, 0.03, gain, 7600, this.musicGain); }
  bass(t, freq) { this.tone(t, freq, 0.2, 'sawtooth', 0.1, this.musicGain, freq * 0.9); }
  synth(t, freq, dur, gain) { this.tone(t, freq, dur, 'square', gain, this.musicGain, freq * 0.99); }

  beep(kind = 'count') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'go') {
      this.tone(t, 660, 0.34, 'square', 0.22, this.sfxGain, 990);
      this.tone(t + 0.05, 990, 0.28, 'sine', 0.12, this.sfxGain);
    } else this.tone(t, 350, 0.15, 'square', 0.17, this.sfxGain, 285);
  }

  impact(strength = 10) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.15, Math.min(0.45, strength / 38), 420);
    this.tone(t, 92, 0.18, 'sine', 0.2, this.sfxGain, 44);
  }

  pad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 220, 0.15, 'sawtooth', 0.11, this.sfxGain, 880);
    this.tone(t + 0.05, 440, 0.2, 'sine', 0.1, this.sfxGain, 1320);
  }

  nitro() {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 180, 0.3, 'sawtooth', 0.14, this.sfxGain, 1500);
  }

  lap() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((f, i) => this.tone(t + i * 0.08, f, 0.22, 'square', 0.1, this.sfxGain));
  }

  finish(win = true) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const seq = win ? [261.63, 329.63, 392, 523.25, 659.25] : [329.63, 293.66, 261.63, 196];
    seq.forEach((f, i) => this.tone(t + i * 0.14, f, 0.4, 'sawtooth', 0.1, this.sfxGain));
  }

  click() {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 900, 0.05, 'square', 0.07, this.sfxGain, 1400);
  }
}
