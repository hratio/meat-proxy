import { Data3DTexture, LinearFilter, HalfFloatType, Mesh, PlaneGeometry, Scene, NoBlending, Vector2, WebGLRenderTarget, type Camera, type WebGLRenderer } from 'three';
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js';
import portraitLut from './portrait-lut.bin?url';
import { portraitSignalShader, type PortraitSignalFrame } from './signal';

let source: Promise<{ size: number; pixels: Uint8Array }> | undefined;
function loadLut() {
  return source ??= fetch(portraitLut).then(async response => {
    if (!response.ok) throw new Error('Portrait color grade unavailable');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 8) throw new Error('Invalid portrait color grade');
    const header = new DataView(bytes), size = header.getUint32(4, true);
    if (header.getUint32(0) !== 0x5052444c || size < 2 || bytes.byteLength !== 8 + size ** 3 * 4) throw new Error('Invalid portrait color grade');
    return { size, pixels: new Uint8Array(bytes, 8) };
  }).catch(error => { source = undefined; throw error; });
}

export async function createPortraitColorGrade(renderer: WebGLRenderer) {
  const { size, pixels } = await loadLut();
  const lut = new Data3DTexture(pixels, size, size, size);
  lut.minFilter = lut.magFilter = LinearFilter;
  lut.needsUpdate = true;
  lut.name = 'Portrait / cold broadcast grade';
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples),
    stencilBuffer: false
  });
  target.texture.name = 'Portrait / linear scene';
  const pass = new LUTPass({ lut });
  pass.renderToScreen = true;
  pass.material.blending = NoBlending;
  pass.material.depthTest = pass.material.depthWrite = false;
  Object.assign(pass.uniforms, {
    signalEnabled: { value: 0 }, signalTime: { value: 0 }, signalBreakup: { value: 0 },
    signalVisibility: { value: 1 }, signalFramed: { value: 0 }, signalMoving: { value: 0 },
    signalSize: { value: new Vector2(1, 1) }
  });
  // LUTPass normally expects opaque display-space input. The portrait target
  // contains premultiplied linear RGB after expression gains and all effects.
  // Unassociate before sRGB conversion/grading; reassociate only for the canvas.
  pass.material.fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform sampler3D lut;
    uniform float lutSize;
    uniform float intensity;
    varying vec2 vUv;
    ${portraitSignalShader}
    void main() {
      vec4 source = signalSource(vUv);
      float alpha = clamp(source.a, 0.0, 1.0);
      if (alpha <= 0.0) { gl_FragColor = signalDisplay(vec3(0.), 0., vUv); return; }
      vec3 linear = max(source.rgb / max(alpha, .00001), vec3(0.0));
      vec3 color = clamp(sRGBTransferOETF(vec4(linear, 1.0)).rgb, 0.0, 1.0);
      float pixelWidth = 1.0 / lutSize;
      vec3 uvw = vec3(0.5 * pixelWidth) + color * (1.0 - pixelWidth);
      vec3 graded = mix(color, texture(lut, uvw).rgb, intensity);
      gl_FragColor = signalDisplay(graded, alpha, vUv);
    }
  `;
  const dimensions = new Vector2();
  return {
    async prepare(scene: Scene, camera: Camera, current = () => true) {
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        await renderer.compileAsync(scene, camera);
      } finally { if (current()) renderer.setRenderTarget(previous); }
      if (!current()) return;
      const geometry = new PlaneGeometry(2, 2), quad = new Scene();
      quad.add(new Mesh(geometry, pass.material));
      try { await renderer.compileAsync(quad, camera); }
      finally { geometry.dispose(); }
    },
    resize() {
      renderer.getDrawingBufferSize(dimensions);
      target.setSize(dimensions.x, dimensions.y);
      renderer.getSize(pass.uniforms.signalSize.value);
    },
    render(scene: Scene, camera: Camera, signal?: PortraitSignalFrame) {
      pass.uniforms.signalEnabled.value = signal ? 1 : 0;
      if (signal) {
        pass.uniforms.signalTime.value = signal.time;
        pass.uniforms.signalBreakup.value = signal.breakup;
        pass.uniforms.signalVisibility.value = signal.visibility;
        pass.uniforms.signalFramed.value = Number(signal.framed);
        pass.uniforms.signalMoving.value = Number(signal.moving);
      }
      const previous = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        // The pass writes directly to the transparent canvas; no second target.
        pass.render(renderer, target, target, 0, false);
      } finally { renderer.setRenderTarget(previous); }
    },
    dispose() { pass.dispose(); target.dispose(); lut.dispose(); }
  };
}
