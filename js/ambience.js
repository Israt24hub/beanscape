/* Beanscape — optional ambient sound.
 *
 * Synthesised with the Web Audio API rather than shipping an audio file: a
 * filtered noise bed for room tone, a low warm drone, and a gentle lift that
 * tracks the steam in the final scene. It is off until the listener asks for
 * it, and it never claims to carry aroma — it is only atmosphere.
 */

export function createAmbience() {
  let ctx = null;
  let master = null;
  let noiseFilter = null;
  let started = false;
  let enabled = false;

  function build() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // --- room tone: brown-ish noise through a low shelf ---
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 420;
    noiseFilter.Q.value = 0.6;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    // --- a quiet warm drone, two detuned sines ---
    [63, 94.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.05 : 0.028;
      osc.connect(g).connect(master);
      osc.start();
    });

    started = true;
    return true;
  }

  return {
    get enabled() { return enabled; },

    async toggle() {
      if (!started && !build()) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      enabled = !enabled;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(enabled ? 0.26 : 0, now, 0.4);
      return enabled;
    },

    /** Open the filter a little as the cup settles and the steam rises. */
    warm(amount) {
      if (!started || !enabled) return;
      const now = ctx.currentTime;
      noiseFilter.frequency.setTargetAtTime(420 + amount * 560, now, 0.9);
    },

    dispose() {
      if (ctx) ctx.close();
      started = false;
      enabled = false;
    }
  };
}
