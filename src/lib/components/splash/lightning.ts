import { AdditiveBlending, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Mesh, PerspectiveCamera, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { boltSegments, clipBoltSegment, sampleLightning, strikeSample, type StrikeSample } from './lightning-math';
import { seededRandom } from './landscape-math';
import { sequenceFrame } from './sequence-math';

export function createLightning() {
  // One reusable ribbon buffer; no per-frame geometry, lights, shadow maps or texture downloads.
  const capacity = 1024 * 6, position = new Float32Array(capacity * 3), other = new Float32Array(capacity * 3), detail = new Float32Array(capacity * 4);
  const geometry = new BufferGeometry();
  for (const [name, data, size] of [['position', position, 3], ['other', other, 3], ['detail', detail, 4]] as const) geometry.setAttribute(name, new Float32BufferAttribute(data, size).setUsage(DynamicDrawUsage));
  const uniforms = {
    strikeColor: { value: new Color() }, strikeOrigin: { value: new Vector3() }, strikeScreen: { value: new Vector3() },
    strikeEnergy: { value: 0 }, strikeEnvironment: { value: .35 }, strikeCloud: { value: .5 },
    strikeWidth: { value: 1 }, strikeLeader: { value: 0 }, strikeReflection: { value: .7 },
    strikeFalloff: { value: 1100000 },
    strikeResolution: { value: new Vector2(1, 1) }
  };
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, uniforms,
    vertexShader: `
      attribute vec3 other; attribute vec4 detail;
      uniform vec2 strikeResolution; uniform float strikeWidth;
      varying vec4 vDetail; varying float vHeight; varying float vReflection;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0), q = modelViewMatrix * vec4(other, 1.0);
        vec4 clip = projectionMatrix * p, next = projectionMatrix * q;
        vec2 direction = normalize((next.xy / next.w - clip.xy / clip.w) * strikeResolution + .00001);
        clip.xy += vec2(-direction.y, direction.x) * detail.x * strikeWidth * 9.0 / strikeResolution * clip.w;
        gl_Position = clip; vDetail = vec4(detail.w, detail.yz, 0.0); vHeight = (modelMatrix * vec4(position, 1.0)).y;
        vReflection = step(modelMatrix[1].y, 0.0);
      }
    `,
    fragmentShader: `
      uniform vec3 strikeColor; uniform float strikeEnergy; uniform float strikeLeader; uniform float strikeReflection;
      varying vec4 vDetail; varying float vHeight; varying float vReflection;
      void main() {
        float side = abs(vDetail.x);
        float halo = exp(-side * side * 7.0) * .22;
        float core = exp(-side * side * 320.0);
        float leader = step(vDetail.y, strikeLeader) * .012 * (1.0 - step(1.0, strikeLeader));
        float energy = (strikeEnergy + leader) * vDetail.z;
        if (vReflection > .5) energy *= strikeReflection * .33 * (.55 + .45 * sin(vHeight * 1.9));
        gl_FragColor = vec4((strikeColor * halo + mix(strikeColor, vec3(1.0), .8) * core) * energy * 4.0, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new Mesh(geometry, material), reflection = new Mesh(geometry, material);
  mesh.frustumCulled = reflection.frustumCulled = false; reflection.scale.y = -1;
  mesh.visible = reflection.visible = false;
  let key = '', eventId = '', anchorTravel = 0, anchorX = 0;
  let manual: { id: number; start?: number; paused: boolean } | undefined;
  const projected = new Vector3();
  function build(event: StrikeSample, branches: number) {
    const segments = boltSegments(event.id, event.kind, branches);
    const p = geometry.getAttribute('position'), o = geometry.getAttribute('other'), d = geometry.getAttribute('detail');
    let index = 0;
    for (const original of segments) {
      const segment = event.cue && event.kind === 'forked' ? clipBoltSegment(original, 10) : original;
      if (!segment) continue;
      for (const [end, side] of [[0, -1], [1, 1], [0, 1], [0, -1], [1, -1], [1, 1]]) {
        const a = end ? segment.b : segment.a, b = end ? segment.a : segment.b;
        p.setXYZ(index, ...a); o.setXYZ(index, ...b);
        d.setXYZW(index++, side * (end ? -1 : 1), segment.progress, segment.strength, side);
      }
    }
    p.needsUpdate = o.needsUpdate = d.needsUpdate = true; geometry.setDrawRange(0, index);
  }
  return {
    mesh, reflection, uniforms,
    preview(id: number, paused: boolean) { manual = id ? { id: (id * 1337) >>> 0, paused } : undefined; },
    resize(width: number, height: number) { uniforms.strikeResolution.value.set(width, height); },
    update(seconds: number, travel: number, config: LandscapeConfig, camera: PerspectiveCamera, reducedMotion: boolean, paused: boolean) {
      const settings = config.lightning;
      let event = sampleLightning(seconds, config.seed, settings);
      if (manual) {
        manual.start ??= seconds;
        if (manual.paused && !paused) { manual.paused = false; manual.start = seconds; }
        const age = manual.paused ? .112 : (seconds - manual.start) / settings.duration;
        if (age < 1.05 && age >= 0) event = { ...strikeSample(manual.id ^ config.seed, age, settings), start: manual.start }; else manual = undefined;
      }
      if (!settings.enabled || reducedMotion) event = undefined;
      uniforms.strikeColor.value.set(settings.color); uniforms.strikeEnvironment.value = settings.environment;
      uniforms.strikeCloud.value = settings.cloudGlow; uniforms.strikeWidth.value = settings.thickness;
      uniforms.strikeReflection.value = settings.reflection;
      uniforms.strikeEnergy.value = event?.energy ?? 0; uniforms.strikeLeader.value = event?.leader ?? 0;
      mesh.visible = !!event && event.kind !== 'sheet'; reflection.visible = mesh.visible && settings.reflection > 0;
      if (!event) return;
      const branches = event.cue?.branches ?? settings.branches;
      const nextKey = `${event.id}:${event.kind}:${branches}:${!!event.cue}`;
      if (key !== nextKey) { build(event, branches); key = nextKey; }
      const originKey = `${event.cue ? 'cue' : 'storm'}:${event.id}:${event.start}`;
      if (eventId !== originKey) { eventId = originKey; anchorX = (seededRandom(event.id)() - .5) * 1.3; }
      anchorTravel = sequenceFrame(event.start ?? seconds, config).travel;
      const halfWidth = Math.tan(camera.fov * Math.PI / 360) * (settings.distance + camera.position.z) * camera.aspect;
      const scale = event.cue ? event.cue.height / 610 : 1;
      // Close impacts need less depth displacement so the expanded ribbons
      // stay ahead of the camera rather than crossing its near plane.
      const depthScale = event.cue ? Math.min(scale, (event.cue.distance - 1) * .45 / 170) : 1;
      mesh.scale.set(scale, scale, depthScale); reflection.scale.set(scale, -scale, depthScale);
      mesh.position.set((event.cue?.x ?? anchorX * halfWidth * settings.spread) - (travel - anchorTravel),
        event.cue ? config.water.waterLevel - 10 * scale : 0,
        event.cue ? camera.position.z - event.cue.distance : -settings.distance);
      reflection.position.copy(mesh.position);
      reflection.position.y = -mesh.position.y;
      uniforms.strikeFalloff.value = event.cue ? Math.max(25000, (event.cue.height + event.cue.distance * .3) ** 2 * 2) : 1100000;
      uniforms.strikeOrigin.value.copy(mesh.position); uniforms.strikeOrigin.value.y += 300 * scale;
      projected.copy(mesh.position); projected.y += 540 * scale; projected.project(camera);
      uniforms.strikeScreen.value.set(projected.x * .5 + .5, projected.y * .5 + .5, camera.aspect);
    },
    dispose() { geometry.dispose(); material.dispose(); }
  };
}

/** Approximate bounced flash light analytically; all surfaces use the same storm event. */
export const lightningLighting = `
  uniform vec3 strikeColor; uniform vec3 strikeOrigin; uniform vec3 strikeScreen;
  uniform float strikeEnergy; uniform float strikeEnvironment; uniform float strikeCloud;
  uniform float strikeFalloff;
  vec3 stormLight(vec3 world, vec3 normal) {
    vec3 delta = strikeOrigin - world;
    float attenuation = 1.0 / (1.0 + dot(delta, delta) / strikeFalloff);
    return strikeColor * strikeEnergy * strikeEnvironment * attenuation * (.18 + .82 * max(0.0, dot(normalize(normal), normalize(delta))));
  }
`;
