/* Beanscape — the timeline that drives the six scenes.
 *
 * One GSAP timeline owns the whole sequence, so skip, replay and
 * reduced-motion are all just positions on the same track. The timeline
 * tweens numbers on `state` only; scene.js derives every visibility flag
 * from those numbers, which is what makes seeking and skipping safe.
 *
 * The camera is one continuous path. There is never a cut.
 */

const T = {
  burst: 0.0,
  cupPresent: 1.00,   // revealed while the camera is already climbing, so it
                      // reads small — and well before the wide shot settles
  wideSettled: 2.4,   // scene 3: inside the funnel mouth, cup already at the throat
  approach: 3.2,      // scene 4: the descent begins
  pour: 7.6,          // scene 5: the streams converge and become a pour
  settleBeat: 10.2,   // the pour stops, the surface calms
  aroma: 11.4,        // scene 6: steam, then the headline
  end: 14.4
};

const IDLE = {
  beanScale: 1, beanOpacity: 1, burst: 0,
  vortexFade: 0, swirlFade: 0, cupReveal: 0,
  pull: 0, merge: 0, settle: 0, pour: 0, steamFade: 0
};

const SETTLED = {
  beanScale: 0, beanOpacity: 0, burst: 1,
  vortexFade: 0, swirlFade: 0, cupReveal: 1,
  pull: 1, merge: 0.3, settle: 1, pour: 0, steamFade: 1
};

export function buildSequence(api, ui, gsap) {
  const { state, camera, camTarget, CAM, setPhase } = api;

  let tl;

  function resetToIdle() {
    tl.pause(0);       // rewind the track
    tl.invalidate();   // forget recorded start values; we set them below
    camera.position.copy(CAM.bean.pos);
    camTarget.copy(CAM.bean.look);
    Object.assign(state, IDLE);
    setPhase('idle');
  }

  /** Jump straight to the finished cup — used by Skip and by reduced motion. */
  function settleImmediately() {
    tl.pause();
    camera.position.copy(CAM.rest.pos);
    camTarget.copy(CAM.rest.look);
    Object.assign(state, SETTLED);
    setPhase('aroma');
  }

  tl = gsap.timeline({ paused: true, onComplete: () => setPhase('aroma') });

  /* ---- scene 2: the burst ---- */
  tl.call(() => setPhase('burst'), null, T.burst)
    .to(state, { beanScale: 1.22, duration: 0.2, ease: 'power2.out' }, T.burst)
    .to(state, { beanScale: 0, duration: 0.32, ease: 'power3.in' }, T.burst + 0.2)
    .to(state, { burst: 1, duration: 1.9, ease: 'power2.out' }, T.burst + 0.18);

  /* ---- the cup is revealed at the centre while the embers still cover it, so
          that by the time the wide shot exists it is simply already there ---- */
  tl.to(state, { cupReveal: 1, duration: 0.8, ease: 'power2.out' }, T.cupPresent);

  /* ---- scene 3: pull back to reveal the vortex ---- */
  tl.to(camera.position, {
      x: CAM.mouth.pos.x, y: CAM.mouth.pos.y, z: CAM.mouth.pos.z,
      duration: 2.4, ease: 'power2.inOut'
    }, T.burst)
    .to(camTarget, {
      x: CAM.mouth.look.x, y: CAM.mouth.look.y, z: CAM.mouth.look.z,
      duration: 2.4, ease: 'power2.inOut'
    }, T.burst)
    .to(state, { vortexFade: 1, duration: 1.5, ease: 'power1.out' }, 0.75)
    .to(state, { swirlFade: 1, duration: 1.5, ease: 'power1.out' }, 0.85)
    .call(() => setPhase('vortex'), null, T.wideSettled);

  /* ---- scene 4: the approach. One long continuous move. ---- */
  tl.call(() => setPhase('approach'), null, T.approach)
    .to(camera.position, {
      x: CAM.mid.pos.x, y: CAM.mid.pos.y, z: CAM.mid.pos.z,
      duration: 2.6, ease: 'none'
    }, T.approach)
    .to(camTarget, {
      x: CAM.mid.look.x, y: CAM.mid.look.y, z: CAM.mid.look.z,
      duration: 2.6, ease: 'none'
    }, T.approach)
    .to(camera.position, {
      x: CAM.close.pos.x, y: CAM.close.pos.y, z: CAM.close.pos.z,
      duration: 2.2, ease: 'power1.out'
    }, T.approach + 2.6)
    .to(camTarget, {
      x: CAM.close.look.x, y: CAM.close.look.y, z: CAM.close.look.z,
      duration: 2.2, ease: 'power1.out'
    }, T.approach + 2.6)
    .to(state, { pull: 0.62, duration: 4.4, ease: 'power1.in' }, T.approach);

  /* ---- scene 5: the converging streams become an actual pour ---- */
  tl.call(() => setPhase('merge'), null, T.pour)
    // the swirl is drawn all the way in first...
    .to(state, { pull: 1, duration: 1.4, ease: 'power2.in' }, T.pour)
    .to(state, { swirlFade: 0, duration: 1.3, ease: 'power2.in' }, T.pour + 0.5)
    .to(state, { vortexFade: 0, duration: 2.0, ease: 'power2.inOut' }, T.pour + 0.6)
    // ...and arrives as a stream falling into the cup
    .to(state, { pour: 1, duration: 0.55, ease: 'power2.out' }, T.pour + 0.25)
    .to(state, { merge: 1, duration: 0.9, ease: 'power2.out' }, T.pour + 0.4)
    .to(camera.position, {
      x: CAM.rest.pos.x, y: CAM.rest.pos.y, z: CAM.rest.pos.z,
      duration: 2.8, ease: 'power1.inOut'
    }, T.pour)
    .to(camTarget, {
      x: CAM.rest.look.x, y: CAM.rest.look.y, z: CAM.rest.look.z,
      duration: 2.8, ease: 'power1.inOut'
    }, T.pour);

  /* ---- the pour stops and the surface begins to calm ---- */
  tl.to(state, { pour: 0, duration: 0.7, ease: 'power2.in' }, T.settleBeat);

  /* ---- scene 6: it settles, steam rises ---- */
  tl.call(() => setPhase('aroma'), null, T.aroma)
    .to(state, { merge: 0.3, duration: 1.8, ease: 'power2.out' }, T.aroma)
    .to(state, { settle: 1, duration: 2.2, ease: 'power2.inOut' }, T.aroma)
    .to(state, { steamFade: 1, duration: 2.0, ease: 'power1.out' }, T.aroma + 0.2)
    .to({}, { duration: 0.1 }, T.end);

  return {
    timeline: tl,
    play() {
      resetToIdle();
      tl.restart();
    },
    skip() {
      settleImmediately();
    },
    settleImmediately,
    resetToIdle,
    get isRunning() { return tl.isActive(); }
  };
}
