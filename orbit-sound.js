/* Web Audio 1.0, checked 2026-11-27: https://www.w3.org/TR/webaudio-1.0/#AudioBufferSourceNode */
(() => {
  'use strict';

  const RATE = 44100;
  const ROOM_TAIL = 1.25;
  const PANS = [-0.08, -0.40, 0.44, 0.18];
  const ROOTS = [38, 33, 36]; // D2, A1, C2
  const SCALES = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10]];
  const OCTAVES = [0, 1, 2, 2];
  const MELODIES = [
    [[0, 3, 0, 2], [3, 1, 4, 2, 3, 0], [4, 2, 1, 3], [0, 1, 3, 2, 1, 4]],
    [[0, 3, 4, 3], [2, 4, 3, 1], [3, 1, 4, 2], [4, 2, 1, 0, 2, 3]],
    [[0, 0, 4, 2], [0, 4, 2, 3, 1], [2, 4, 1, 0], [3, 1, 2, 4, 2, 1]]
  ];

  // Each resonant mode specifies the frequency ratio, strike strength and decay in seconds.
  const VOICES = [
    { attack: 0.011, modes: [[1, .42, .28], [2, .145, .17], [3, .048, .09], [5, .025, .048]] },
    { attack: 0.004, modes: [[1, .27, .25], [2.003, .11, .17], [3.012, .085, .093], [5.02, .046, .047]] },
    { attack: 0.009, modes: [[1, .19, .34], [2.004, .065, .23], [2.708, .05, .13], [4.14, .035, .098]] },
    { attack: 0.004, modes: [[1, .23, .145], [3.985, .071, .07], [9.13, .022, .026]] }
  ];

  const clamp = (x, low, high) => Math.max(low, Math.min(x, high));
  const phaseOf = x => ((x % 1) + 1) % 1;
  const saturate = x => Math.tanh(clamp(x, -1, 1) * 1.15) * 0.98;

  function pitch(index, preset, step) {
    const melody = MELODIES[preset][index];
    return ROOTS[preset] + 12 * OCTAVES[index] + SCALES[preset][melody[step % melody.length]];
  }

  function strike(index, midi) {
    const voice = VOICES[index];
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const frames = Math.ceil(voice.modes[0][2] * 7.5 * RATE);
    const samples = new Float32Array(frames);

    for (const [ratio, strength, decay] of voice.modes) {
      const angle = 2 * Math.PI * frequency * ratio / RATE;
      const coefficient = 2 * Math.cos(angle);
      const damping = Math.exp(-1 / (decay * RATE));
      let older = -Math.sin(angle);
      let previous = 0;
      let amplitude = strength;
      for (let i = 0; i < frames; i++) {
        const next = coefficient * previous - older;
        samples[i] += previous * amplitude;
        older = previous;
        previous = next;
        amplitude *= damping;
      }
    }
    const attack = Math.ceil(voice.attack * RATE);
    for (let i = 0; i < attack; i++) samples[i] *= Math.sin(Math.PI * i / (2 * attack)) ** 2;
    for (let i = 1; i <= 128; i++) samples[frames - i] *= i / 128;
    return samples;
  }

  function roomReturn(samples, right) {
    const wet = new Float32Array(samples.length + Math.ceil(ROOM_TAIL * RATE));
    const delays = right ? [1357, 1777, 2143] : [1223, 1621, 1999];
    for (const delay of delays) {
      const line = new Float32Array(delay);
      let cursor = 0;
      let damped = 0;
      for (let i = 0; i < wet.length; i++) {
        const reflected = line[cursor];
        damped += 0.36 * (reflected - damped);
        line[cursor] = (samples[i] || 0) + damped * 0.66;
        wet[i] += reflected * 0.29;
        if (++cursor === delay) cursor = 0;
      }
    }
    // A short all-pass diffuser scatters the comb echoes without shifting their pitch.
    const diffusion = new Float32Array(right ? 281 : 227);
    let cursor = 0;
    for (let i = 0; i < wet.length; i++) {
      const input = wet[i];
      wet[i] = diffusion[cursor] - input * .58;
      diffusion[cursor] = input + wet[i] * .58;
      if (++cursor === diffusion.length) cursor = 0;
    }
    return wet;
  }

  function writeWav(left, right) {
    const bytes = new ArrayBuffer(44 + left.length * 4);
    const view = new DataView(bytes);
    const tag = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };
    tag(0, 'RIFF');
    view.setUint32(4, bytes.byteLength - 8, true);
    tag(8, 'WAVE');
    tag(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    tag(36, 'data');
    view.setUint32(40, left.length * 4, true);
    for (let i = 0; i < left.length; i++) {
      view.setInt16(44 + i * 4, Math.round(saturate(left[i]) * 32767), true);
      view.setInt16(46 + i * 4, Math.round(saturate(right[i]) * 32767), true);
    }
    return new Blob([bytes], { type: 'audio/wav' });
  }

  window.OrbitSound = class OrbitSound {
    constructor() {
      this.space = .32;
      this.notes = new Map();
      this.sources = new Map();
    }

    get now() { return this.ctx ? this.ctx.currentTime : 0; }

    async unlock() {
      if (!this.ctx) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('이 브라우저에서 오디오 연주를 지원하지 않습니다.');
        this.ctx = new Audio();
        this.output = this.ctx.createWaveShaper();
        this.output.curve = Float32Array.from({ length: 4097 }, (_, i) => saturate(i / 2048 - 1));
        this.output.connect(this.ctx.destination);
        this.wet = this.ctx.createGain();
        this.wet.gain.value = this.space * .7;
        this.wet.connect(this.output);
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return true;
    }

    setSpace(value) {
      if (!Number.isFinite(value)) return;
      this.space = clamp(value, 0, 1);
      if (this.wet) this.wet.gain.setTargetAtTime(this.space * .7, this.now, .014);
    }

    note(index, preset, step) {
      const midi = pitch(index, preset, step);
      const key = index + '/' + midi;
      let note = this.notes.get(key);
      if (!note) {
        const dry = strike(index, midi);
        const angle = (1 + PANS[index]) * Math.PI / 4;
        note = {
          dry, pan: [Math.cos(angle), Math.sin(angle)],
          wet: [roomReturn(dry, false), roomReturn(dry, true)]
        };
        if (this.notes.size >= 20) this.notes.delete(this.notes.keys().next().value);
        this.notes.set(key, note);
      }
      return note;
    }

    pluck(index, preset = 0, step = 0, when = this.now) {
      if (!this.ctx || !VOICES[index] || !MELODIES[preset]) return;
      const note = this.note(index, preset, Math.max(0, Math.trunc(step)));
      if (!note.buffers) {
        const dry = this.ctx.createBuffer(2, note.dry.length, RATE);
        const wet = this.ctx.createBuffer(2, note.wet[0].length, RATE);
        for (let channel = 0; channel < 2; channel++) {
          const samples = dry.getChannelData(channel);
          for (let i = 0; i < samples.length; i++) samples[i] = note.dry[i] * note.pan[channel];
          wet.getChannelData(channel).set(note.wet[channel]);
        }
        note.buffers = [dry, wet];
      }
      const start = Math.max(this.now, when);
      note.buffers.forEach((buffer, channel) => {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gate = this.ctx.createGain();
        source.connect(gate);
        gate.connect(channel ? this.wet : this.output);
        source.onended = () => {
          this.sources.delete(source);
          source.disconnect();
          gate.disconnect();
        };
        this.sources.set(source, { gate, index, start });
        source.start(start);
      });
    }

    cancelScheduled(index = null) {
      this.stop(index, true);
    }

    stop(index = null, futureOnly = false) {
      const time = this.now;
      for (const [source, voice] of this.sources) {
        if (index !== null && voice.index !== index) continue;
        const pending = voice.start > time;
        if (futureOnly && !pending) continue;
        const gain = voice.gate.gain;
        if (pending) {
          gain.setValueAtTime(0, time);
          source.stop(time);
        } else {
          gain.setValueAtTime(1, time);
          gain.linearRampToValueAtTime(0, time + .012);
          source.stop(time + .014);
        }
        this.sources.delete(source);
      }
    }

    async renderWav({ bpm, preset = 0, enabled, space = this.space, phases, cycles, steps = [0, 0, 0, 0] }) {
      if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400 || !MELODIES[preset]) {
        throw new Error('저장할 악보의 속도와 음계를 확인해 주세요.');
      }
      const period = 8 * 60 / bpm;
      const events = [];
      let frames = Math.ceil(period * RATE);
      const voices = Array.from({ length: 4 }, (_, i) => ({
        active: enabled[i], count: cycles[i], phase: phaseOf(phases[i]), nextStep: Math.max(0, Math.trunc(steps[i] || 0))
      }));
      for (const [index, voice] of voices.entries()) {
        if (!voice.active) continue;
        const { count, phase, nextStep } = voice;
        if (!Number.isInteger(count) || count < 1 || count > 64 || !Number.isFinite(phase)) {
          throw new Error('저장할 악보의 궤도를 확인해 주세요.');
        }
        const first = phase === 0 ? 0 : 1 - phase;
        for (let k = 0; k < count; k++) {
          const offset = Math.round((first + k) * period * RATE / count);
          const note = this.note(index, preset, nextStep + k);
          events.push({ offset, note });
          frames = Math.max(frames, offset + (space > 0 ? note.wet[0].length : note.dry.length));
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const channels = [new Float32Array(frames), new Float32Array(frames)];
      const send = clamp(space, 0, 1) * .7;
      for (const { offset, note } of events) {
        for (let c = 0; c < 2; c++) {
          const output = channels[c];
          for (let i = 0; i < note.dry.length; i++) output[offset + i] += note.dry[i] * note.pan[c];
          if (send) {
            const wet = note.wet[c];
            for (let i = 0; i < wet.length; i++) output[offset + i] += wet[i] * send;
          }
        }
      }
      return writeWav(channels[0], channels[1]);
    }
  };
})();
