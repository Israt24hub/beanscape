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
  cupPresent: 1.00,   // revealed once the camera is already pulling back,
                      // so it reads small — and well before the wide shot settles
  wideSettled: 2.2,   // scene 3: wide shot established, cup already there
  approach: 3.0,      // scene 4 begins
  merge: 7.8,         // scene 5 begins
  aroma: 9.9,         // scene 6 begins
  end: 12.6
};

const IDLE = {
  beanScale: 1, beanOpacity: 1, burst: 0,
  vortexFade: 0, swirlFade: 0, cupReveal: 0,
  pull: 0, merge: 0, settle: 0, steamFade: 0
};

const SETTLED = {
  beanScale: 0, beanOpacity: 0, burst: 1,
  vortexFade: 0, swirlFade: 0, cupReveal: 1,
  pull: 1, merge: 0.3, settle: 1, steamFade: 1
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
      x: CAM.wide.pos.x, y: CAM.wide.pos.y, z: CAM.wide.pos.z,
      duration: 2.2, ease: 'power2.inOut'
    }, T.burst)
    .to(camTarget, {
      x: CAM.wide.look.x, y: CAM.wide.look.y, z: CAM.wide.look.z,
      duration: 2.2, ease: 'power2.inOut'
    }, T.burst)
    .to(state, { vortexFade: 1, duration: 1.5, ease: 'power1.out' }, 0.75)
    .to(state, { swirlFade: 1, duration: 1.5, ease: 'power1.out' }, 0.85)
    .call(() => setPhase('vortex'), null, T.wideSettled);

  /* ---- scene 4: the approach. One long continuous move. ---- */
  tl.call(() => setPhase('approach'), null, T.approach)
    .to(camera.position, {
      x: CAM.close.pos.x, y: CAM.close.pos.y, z: CAM.close.pos.z,
      duration: 4.8, ease: 'power1.inOut'
    }, T.approach)
    .to(camTarget, {
      x: CAM.close.look.x, y: CAM.close.look.y, z: CAM.close.look.z,
      duration: 4.8, ease: 'power1.inOut'
    }, T.approach)
    .to(state, { pull: 0.58, duration: 4.8, ease: 'power1.in' }, T.approach);

  /* ---- scene 5: the swirl folds into the coffee already in the cup ---- */
  tl.call(() => setPhase('merge'), null, T.merge)
    .to(state, { pull: 1, duration: 1.7, ease: 'power2.in' }, T.merge)
    .to(state, { merge: 1, duration: 1.1, ease: 'power2.out' }, T.merge)
    .to(state, { swirlFade: 0, duration: 1.5, ease: 'power2.in' }, T.merge + 0.5)
    .to(state, { vortexFade: 0, duration: 2.2, ease: 'power2.inOut' }, T.merge + 0.4)
    .to(camera.position, {
      x: CAM.rest.pos.x, y: CAM.rest.pos.y, z: CAM.rest.pos.z,
      duration: 2.6, ease: 'power1.inOut'
    }, T.merge)
    .to(camTarget, {
      x: CAM.rest.look.x, y: CAM.rest.look.y, z: CAM.rest.look.z,
      duration: 2.6, ease: 'power1.inOut'
    }, T.merge);

  /* ---- scene 6: it settles, steam rises ---- */
  tl.call(() => setPhase('aroma'), null, T.aroma)
    .to(state, { merge: 0.3, duration: 1.6, ease: 'power2.out' }, T.aroma)
    .to(state, { settle: 1, duration: 2.0, ease: 'power2.inOut' }, T.aroma)
    .to(state, { steamFade: 1, duration: 1.8, ease: 'power1.out' }, T.aroma + 0.15)
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
