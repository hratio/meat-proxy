import { Data3DTexture, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget, type WebGLRenderer, type PerspectiveCamera } from 'three';
import type { LandscapeConfig } from './landscape-config';

type Cinema = LandscapeConfig['cinema'];
export const gradeSize = 17;

/** Small trilinear LUTs are generated once per look, in display space, without fetching images. */
export function fillGradeLut(data: Uint8Array, look: Cinema['look']) {
  let index = 0;
  for (let b = 0; b < gradeSize; b++) for (let g = 0; g < gradeSize; g++) for (let r = 0; r < gradeSize; r++) {
    const rgb = [r, g, b].map(value => value / (gradeSize - 1));
    const luma = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    const shadows = (1 - luma) ** 2, highlights = luma ** 2;
    const tones = { neutral: [0, 0, 0], steel: [-.035, .018, .065], amber: [.06, .018, -.045], toxic: [-.02, .055, -.025], bleach: [0, 0, 0] }[look];
    for (let i = 0; i < 3; i++) {
      let value = rgb[i];
      if (look === 'bleach') value = (luma + (value - luma) * .38 - .5) * 1.12 + .5;
      else value += tones[i] * shadows + (look === 'steel' ? [.04, .018, -.015][i] : tones[i] * .35) * highlights;
      data[index++] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
    data[index++] = 255;
  }
  return data;
}

const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** One scene target, two quarter-resolution bloom buffers, one combined finishing pass. */
export function createCinematic(renderer: WebGLRenderer) {
  const sceneTarget = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  const bloomA = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const bloomB = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const data = new Uint8Array(gradeSize ** 3 * 4);
  const lut = new Data3DTexture(fillGradeLut(data, 'neutral'), gradeSize, gradeSize, gradeSize);
  lut.format = RGBAFormat; lut.type = UnsignedByteType; lut.minFilter = lut.magFilter = LinearFilter; lut.unpackAlignment = 1; lut.needsUpdate = true;
  const blur = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader,
    uniforms: { source: { value: sceneTarget.texture }, stepSize: { value: new Vector2() }, sourceTexel:{value:new Vector2()}, threshold: { value: .24 }, extract: { value: 1 } },
    fragmentShader: `
      varying vec2 vUv; uniform sampler2D source; uniform vec2 stepSize; uniform vec2 sourceTexel; uniform float threshold; uniform float extract;
      vec3 hdrLight(vec2 uv) {
        vec4 texel = texture2D(source,uv);
        return texel.rgb * (1.0 + max(0.0,texel.a - 1.0));
      }
      vec3 sampleLight(vec2 uv) {
        vec3 color = texture2D(source,uv).rgb;
        if (extract > .5) {
          // Preserve small navigation lights through quarter-size bloom.
          color=max(max(hdrLight(uv+sourceTexel*vec2(-.75,-.75)),hdrLight(uv+sourceTexel*vec2(.75,-.75))),
            max(hdrLight(uv+sourceTexel*vec2(-.75,.75)),hdrLight(uv+sourceTexel*vec2(.75,.75))));
        }
        float brightness = max(color.r, max(color.g, color.b));
        return color * mix(1.0, smoothstep(threshold * .65, threshold * 1.35, brightness), extract);
      }
      void main() {
        vec3 color = sampleLight(vUv) * .227027;
        color += (sampleLight(vUv + stepSize * 1.384615) + sampleLight(vUv - stepSize * 1.384615)) * .316216;
        color += (sampleLight(vUv + stepSize * 3.230769) + sampleLight(vUv - stepSize * 3.230769)) * .070270;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const finish = new ShaderMaterial({ depthTest: false, depthWrite: false, vertexShader,
    uniforms: {
      source: { value: sceneTarget.texture }, bloomMap: { value: bloomB.texture }, lut: { value: lut },
      bloom: { value: .4 }, lookStrength: { value: .65 }, contrast: { value: 1.04 }, saturation: { value: .96 }, lift: { value: 0 },
      fade: { value: 0 }, grain: { value: .045 }, grainSize: { value: 1.2 }, grainFrame: { value: 0 }, vignette: { value: .16 }
    },
    fragmentShader: `
      precision highp sampler3D;
      varying vec2 vUv; uniform sampler2D source; uniform sampler2D bloomMap; uniform sampler3D lut;
      uniform float bloom; uniform float lookStrength; uniform float contrast; uniform float saturation; uniform float lift;
      uniform float fade; uniform float grain; uniform float grainSize; uniform float grainFrame; uniform float vignette;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main() {
        vec3 color = texture2D(source, vUv).rgb + texture2D(bloomMap, vUv).rgb * bloom;
        gl_FragColor = vec4(max(color, 0.0), 1.0);
        // Same highlight shoulder as direct rendering. Render targets stay
        // linear HDR; output conversion occurs once, before display-space LUT.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        color = gl_FragColor.rgb;
        color = texture(lut, clamp(color, 0.0, 1.0) * ${(gradeSize - 1) / gradeSize} + ${.5 / gradeSize}).rgb * lookStrength + color * (1.0 - lookStrength);
        float luma = dot(color, vec3(.2126, .7152, .0722));
        color = mix(vec3(luma), color, saturation);
        color = (color - .5) * contrast + .5 + lift;
        vec2 q = vUv * 2.0 - 1.0; color *= 1.0 - vignette * smoothstep(.2, 1.7, dot(q, q));
        float noise = hash(floor(gl_FragCoord.xy / grainSize) + grainFrame * vec2(17.71, 31.13)) - .5;
        color += noise * grain * (.35 + .65 * sqrt(clamp(luma, 0.0, 1.0)));
        gl_FragColor = vec4(clamp(color, 0.0, 1.0)*(1.0-fade), 1.0);
      }
    `
  });
  const scene = new Scene(), camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1), geometry = new PlaneGeometry(2, 2), quad = new Mesh(geometry, finish);
  quad.frustumCulled = false; scene.add(quad);
  const fadeMaterial=new ShaderMaterial({vertexShader,transparent:true,depthTest:false,depthWrite:false,
    uniforms:{fade:{value:0}},fragmentShader:'uniform float fade;void main(){gl_FragColor=vec4(0.0,0.0,0.0,fade);}'});
  let settings: Cinema, look = 'neutral', width = 0, height = 0;
  return {
    configure(next: Cinema) {
      settings = next;
      if (look !== next.look) { fillGradeLut(data, next.look); lut.needsUpdate = true; look = next.look; }
      for (const key of ['bloom', 'lookStrength', 'contrast', 'saturation', 'lift', 'grain', 'grainSize', 'vignette'] as const) finish.uniforms[key].value = next[key];
      finish.uniforms.bloom.value=next.bloomEnabled?next.bloom:0;
      finish.uniforms.grain.value=next.grainEnabled?next.grain:0;
      blur.uniforms.threshold.value = next.bloomThreshold;
    },
    resize(w: number, h: number) {
      if (width === w && height === h) return;
      width = w; height = h; sceneTarget.setSize(w, h);
      blur.uniforms.sourceTexel.value.set(1/w,1/h);
      bloomA.setSize(Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4))); bloomB.setSize(bloomA.width, bloomA.height);
    },
    async prepare(world: Scene, lens: PerspectiveCamera) {
      renderer.setRenderTarget(sceneTarget);
      await renderer.compileAsync(world, lens);
      renderer.setRenderTarget(null);
      await renderer.compileAsync(world, lens);
      renderer.setRenderTarget(bloomA);
      quad.material = blur; await renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
      quad.material = finish; await renderer.compileAsync(scene, camera);
    },
    render(world: Scene, lens: PerspectiveCamera, seconds: number, fade=0) {
      finish.uniforms.fade.value=fade;
      if (!settings.enabled) {
        renderer.setRenderTarget(null); renderer.render(world, lens);
        if(fade>0){const clear=renderer.autoClear;renderer.autoClear=false;quad.material=fadeMaterial;fadeMaterial.uniforms.fade.value=fade;renderer.render(scene,camera);renderer.autoClear=clear;}
        return;
      }
      renderer.setRenderTarget(sceneTarget); renderer.render(world, lens);
      if (settings.bloomEnabled && settings.bloom > 0) {
        quad.material = blur; blur.uniforms.source.value = sceneTarget.texture; blur.uniforms.extract.value = 1;
        blur.uniforms.stepSize.value.set(settings.bloomRadius / bloomA.width, 0);
        renderer.setRenderTarget(bloomA); renderer.render(scene, camera);
        blur.uniforms.source.value = bloomA.texture; blur.uniforms.extract.value = 0;
        blur.uniforms.stepSize.value.set(0, settings.bloomRadius / bloomA.height);
        renderer.setRenderTarget(bloomB); renderer.render(scene, camera);
      }
      finish.uniforms.grainFrame.value = Math.floor(seconds * settings.grainSpeed);
      quad.material = finish; renderer.setRenderTarget(null); renderer.render(scene, camera);
    },
    dispose() { sceneTarget.dispose(); bloomA.dispose(); bloomB.dispose(); lut.dispose(); blur.dispose(); finish.dispose();fadeMaterial.dispose(); geometry.dispose(); }
  };
}
