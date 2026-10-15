/* Entry point for the vendored bundle: three plus the postprocessing passes the
   scene needs, in ONE module so there is never a second copy of three loaded
   (two copies break every instanceof check in the library). */
export * from '../node_modules/three/build/three.module.js';
export { EffectComposer } from '../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
export { RenderPass } from '../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
export { ShaderPass } from '../node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
export { UnrealBloomPass } from '../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
export { OutputPass } from '../node_modules/three/examples/jsm/postprocessing/OutputPass.js';
