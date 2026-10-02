import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DataTexture,
  Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, LinearFilter,
  Matrix3, Matrix4, Mesh, NeutralToneMapping, Object3D, PerspectiveCamera, PlaneGeometry, RedFormat,
  RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, Texture, Vector2, Vector3, WebGLRenderer
} from 'three';
import { assetUrl } from '../../asset-url';
import { createModelLoader } from '../../models/loader';
import type { LandscapeConfig } from './landscape-config';
import { landscapeGeometryKey, seededRandom } from './landscape-math';
import { defaultSplashConfig } from './playback-config';
import { sequenceFrame } from './sequence-math';
import type { RenderCanvas } from '../../render/surface';
import { createLightning, lightningLighting } from './lightning';
import { createCinematic } from './cinematic';
import { createShoreline } from './shoreline';
import { createCrownDisplay } from './crown-display';
import { createObservatoryDisplay } from './observatory-display';
import { createShoreProfile } from './shoreline-math';
import { createDrivingSet } from './driving-set';
import { waterWaveShader } from './water-waves';
import { createAtmosphere, atmosphereShader } from './atmosphere';
import { cityPeriod, moonAnchor } from './scene-anchors';
import { routeDistrictCenter, cityStreetClearance, nearBankHeight, bankStreetDistance, garagePlacement, garageSchedule, garageFade } from './driving-route';


export async function createLandscape(canvas: RenderCanvas, initial: LandscapeConfig = defaultSplashConfig.landscape, pixelRatio = 1, current = () => true) {
  const loader = createModelLoader();
  const assets = await loader.loadAsync(assetUrl('/scenery/waterfront.glb'));
  let cabinAssets: Awaited<ReturnType<typeof loader.loadAsync>> | undefined;
  let cabinLoading: Promise<void> | undefined, disposed = false;
  const disposeAssets = (loaded = [assets, cabinAssets]) => {
    const textures = new Set<Texture>();
    for (const asset of loaded) asset?.scene.traverse(object => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
          material.dispose();
        }
      }
    });
    for (const texture of textures) {
      texture.dispose();
      if (typeof ImageBitmap !== 'undefined' && texture.source.data instanceof ImageBitmap) texture.source.data.close();
    }
  };
  if (!current()) {
    disposeAssets();
    throw new Error('Landscape disposed while loading');
  }
  assets.scene.updateMatrixWorld(true);
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1; // Exposure is applied once, in linear sceneTint.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.info.autoReset = false;
  const cinema = createCinematic(renderer);
  let settings = initial, generation = landscapeGeometryKey(initial);
  let view = createScene(renderer, assets.scene, settings, () => pixelRatio, cinema);
  let width = 1, height = 1;
  let lastTime = 0, lastReduced = false, lastPaused = false;
  function loadCabin() {
    return cabinLoading ??= loader.loadAsync(assetUrl('/scenery/driving-set.glb')).then(asset => {
      cabinAssets = asset;
      if (disposed || !current()) { disposeAssets([asset]); return; }
      view.setCabin(asset.scene); view.render(lastTime, lastReduced, lastPaused);
    }).catch(error => { cabinLoading = undefined; throw error; });
  }
  view.configure(settings);
  return {
    configure(next: LandscapeConfig) {
      const key = landscapeGeometryKey(next);
      if (generation !== key) { view.dispose(); view = createScene(renderer, assets.scene, next, () => pixelRatio, cinema); generation = key; }
      settings = next; view.configure(settings); view.resize(width, height);
      if (cabinAssets) view.setCabin(cabinAssets.scene);
      else if (next.sequence?.enabled) void loadCabin().catch(error => console.error('Driving cabin could not load', error));
    },
    resize(w: number, h: number, ratio = pixelRatio) { pixelRatio = ratio; width = w; height = h; view.resize(w, h); },
    async prepare() { if (settings.sequence?.enabled) await loadCabin(); if (!disposed) await view.prepare(); },
    render(seconds: number, reducedMotion = false, paused = false) { lastTime=seconds; lastReduced=reducedMotion; lastPaused=paused; view.render(seconds, reducedMotion, paused); },
    previewLightning(cue: number, paused: boolean) { view.previewLightning(cue, paused); },
    stats() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    dispose() {
      disposed = true;
      view.dispose();
      cinema.dispose();
      disposeAssets();
      renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    }
  };
}

function createScene(renderer: WebGLRenderer, assets: Group, initial: LandscapeConfig, getPixelRatio: () => number, cinema: ReturnType<typeof createCinematic>) {
  let settings = initial;
  const scene = new Scene();
  const camera = new PerspectiveCamera(43, 1, .03, 14000);
  camera.position.set(0, 58, 330);
  camera.lookAt(0, 101, -700);
  const geometries: BufferGeometry[] = [];
  const materials: ShaderMaterial[] = [];
  const meshes: InstancedMesh[] = [];
  const clock = { value: 0 };
  const haze = new Color('#514b3b');
  const random = seededRandom(settings.seed);
  const terrain = createShoreProfile(settings.seed, settings.docks);
  const lightning = createLightning();
  scene.add(lightning.mesh, lightning.reflection);
  const wrap = (value: number, length: number) => ((value % length) + length) % length;
  const geometry = <T extends BufferGeometry>(value: T) => { geometries.push(value); return value; };
  const shader = (options: NonNullable<ConstructorParameters<typeof ShaderMaterial>[0]>) => {
    const material = new ShaderMaterial({ ...options, uniforms: { ...uniforms, ...atmosphere.uniforms, ...lightning.uniforms, ...options.uniforms },
      fragmentShader: declarations + lightningLighting + atmosphereShader + options.fragmentShader!.replace('#include <colorspace_fragment>', 'gl_FragColor.rgb *= sceneTint;\n#include <tonemapping_fragment>\n#include <colorspace_fragment>') });
    materials.push(material); return material;
  };
  function asset(name: string) {
    const mesh = (assets.getObjectByName(name) ?? assets.getObjectByName(name.replace('Distant', ''))) as Mesh;
    return geometry(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  }

  const noisePixels = Uint8Array.from({ length: 64 * 64 }, () => random() * 255);
  // Smooth the seeded weather field once on the CPU. Shader samples retain
  // broad rounded forms without extra per-fragment noise octaves.
  const weatherPixels = new Uint8Array(256*256);
  for (let y=0;y<256;y++) for (let x=0;x<256;x++) {
    const ix=Math.floor(x/4),iy=Math.floor(y/4),fx=x/4-ix,fy=y/4-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=noisePixels[iy*64+ix],b=noisePixels[iy*64+(ix+1)%64];
    const c=noisePixels[((iy+1)%64)*64+ix],d=noisePixels[((iy+1)%64)*64+(ix+1)%64];
    weatherPixels[y*256+x]=(a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
  }
  const weatherNoise = new DataTexture(weatherPixels, 256, 256, RedFormat);
  weatherNoise.wrapS = weatherNoise.wrapT = RepeatWrapping;
  weatherNoise.minFilter = weatherNoise.magFilter = LinearFilter;
  weatherNoise.needsUpdate = true;
  const drift = { value: 0 };
  const atmosphere = createAtmosphere(weatherNoise, clock, drift);

  // Geometry edits retain the renderer and decoded GLB.
  const paletteBase = ['#444b40', '#272e27', '#e9a250', '#a9b785', '#ec4322', '#171d18', '#3c4235', '#e9a250', '#a9b785'].map(value => new Color(value));
  const uniforms = {
    sceneTint: { value: new Color(1, 1, 1) }, lightDirection: { value: new Vector3(-.6, .8, .5) }, lightStrength: { value: 1 },
    keyColor: { value: new Color('#b1bfcb') }, ambientStrength: { value: .16 }, signSpill: { value: .22 },
    corporateOrigin: { value: new Vector3() }, observatoryOrigin: { value: new Vector3() },
    palette: { value: paletteBase.map(() => new Color(1, 1, 1)) }, windowBrightness: { value: 1 }, windowDensity: { value: .4 }, windowScale: { value: 1 },
    textureScale: { value: 1 }, weathering: { value: 1 }, pattern: { value: 0 }, metalness: { value: .15 }, dockLights: { value: 1 },
    cityGlow: { value: .6 }, lightLife: { value: .35 }, lightSpeed: { value: .5 }, beaconPulse: { value: .65 },
    beaconBrightness: {value:1}, beaconGlow: {value:1.5},
    signBrightness: { value: 1.5 }, signSpeed: { value: 1 }, signColor: { value: new Color('#ff1284') }, signGlow: { value: .65 },
    observatorySignBrightness: { value: 1.5 }, observatorySignColor: { value: new Color('#88e6ff') }, observatorySignGlow: { value: .65 }, observatorySignSpeed: { value: 0 },
    garageActive:{value:0},garageOrigin:{value:new Vector3()},garageAxis:{value:new Vector2()},garageWidth:{value:10},garageHeight:{value:5.5},garageDepth:{value:80},
    skyTop: { value: new Color() }, horizonColor: { value: new Color() }, sunColor: { value: new Color() }, sunGlow: { value: 1 },
    cloudColor: { value: new Color() }, cloudCover: { value: .62 }, cloudScale: { value: 1 }, cloudSpeed: { value: 1 },
    moonBrightness: { value: 1 }, moonX: { value: .77 }, moonY: { value: .79 }, moonSize: { value: 1 }, hazeAmount: { value: 1 },
    moonColor: {value:new Color('#e6ebef')}, moonGlow: {value:.6}, moonGlowRadius: {value:.6},
    moonDirection: { value: new Vector3(-.4, .7, -.6).normalize() },
    rockColor: { value: new Color() }, snowColor: { value: new Color() }, snowLine: { value: 640 }, snowAmount: { value: .5 }, ruggedness: { value: 1 }, terrainSeed: { value: 0 },
    fogAmount: { value: .24 }, rainColor: { value: new Color() }, rainSpeed: { value: 1 }, wind: { value: -34 }, rainLength: { value: 1 },
    waterNear: { value: new Color() }, waterFar: { value: new Color() }, waterGlint: { value: new Color() },
    skyReflection: { value: .7 }, waterRoughness: { value: .32 }, rainRipples: { value: .15 },
    waveScale: { value: 1 }, waveSpeed: { value: 1 }, waveHeight: { value: .45 }, waveLength: { value: 120 }, waterLevel: { value: -.2 }, rippleStrength: { value: 1 }, reflections: { value: 1 }, distortion: { value: 1 }
  };
  const declarations = Object.entries(uniforms).map(([key, uniform]) =>
    `uniform ${typeof uniform.value === 'number' ? 'float' : uniform.value instanceof Vector2 ? 'vec2' : 'vec3'} ${key}${Array.isArray(uniform.value) ? '[9]' : ''};`).join('\n') + '\n';
  const surfaceUniforms = { ...uniforms, ...atmosphere.uniforms, ...lightning.uniforms, time: clock, haze: { value: haze } };
  const shoreline = createShoreline(settings, surfaceUniforms);
  scene.add(shoreline.group);
  const driving = createDrivingSet(surfaceUniforms); scene.add(driving.group);

  const sky = new Mesh(geometry(new PlaneGeometry(2, 2)), shader({
    depthWrite: false, depthTest: false,
    uniforms: { ...atmosphere.uniforms, aspect: { value: 1 }, time: clock,
      skyCamera: { value: new Matrix3() }, skyInverse: { value: new Matrix4() },
      skyReference: { value: new Matrix3() }, skyTangent: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float aspect;
      uniform float time;
      uniform mat3 skyCamera;
      uniform mat4 skyInverse;
      uniform mat3 skyReference;
      uniform float skyTangent;
      void main() {
        vec3 ray = normalize(skyCamera * (skyInverse * vec4(vUv * 2.0 - 1.0,1.0,1.0)).xyz);
        vec3 night = skyTop;
        vec3 horizon = horizonColor;
        float band = exp(-pow(max(0.0,ray.y) * 4.0, 2.0));
        vec3 color = mix(night, horizon, band * .86);
        vec3 dusk = ray-normalize(vec3(-.65,.04,-1.0));
        color += sunColor * sunGlow * exp(-dot(dusk, dusk) * 5.0);
        float cover = ceilingCover(ray);
        float mass = weatherMass(weatherPosition(cameraPosition + ray * 5000.0));
        color = mix(color, cloudColor * (.5 + .5 * mass) + cloudIllumination(ray,cameraPosition), cover);
        vec3 reference = skyReference * ray;
        vec2 address = .5 + .5 * reference.xy / max(.0001,-reference.z) / (vec2(16.0/9.0,1.0)*skyTangent);
        vec2 moon = (address - vec2(moonX, moonY)) * vec2(16.0/9.0, 1.0) / moonSize;
        float disc = 1.0 - smoothstep(.020, .021, length(moon));
        float shadow = smoothstep(.022, .023, length(moon + vec2(.012, .005)));
        // The moon is a luminous HDR source behind the weather. Keep surface
        // variation subtle; cloud extinction still dims both crescent and halo.
        float moonVisible=step(reference.z,0.0)*moonBrightness;
        if(disc*shadow*moonVisible>0.0){
          vec2 lunar=moon/.0205;
          float relief=.72+.24*texture2D(airNoise,lunar*.017+vec2(.42,.63)).r
            +.04*texture2D(airNoise,lunar*.07+vec2(.18,.81)).r;
          float terminator=.35+.65*sqrt(clamp((length(moon+vec2(.012,.005))-.0225)/.014,0.0,1.0));
          color += moonColor*10.0*relief*terminator*disc*shadow*moonVisible*exp(-cover*3.0);
        }
        // Distance to the crescent, rather than its disc: scattering follows
        // the illuminated limb instead of drawing a circular halo on the sky.
        float crescentDistance=max(length(moon)-.0205,.0225-length(moon+vec2(.012,.005)));
        float halo=exp(-pow(max(0.0,crescentDistance)/(.0205*moonGlowRadius),1.4));
        // Halo has its own dimmer: reducing the core need not reduce scatter.
        color += moonColor*moonGlow*step(reference.z,0.0)*halo*.35*(.18+.82*cover);
        vec2 flash = (vUv - strikeScreen.xy) * vec2(aspect, 1.0);
        color += strikeColor * strikeEnergy * strikeCloud * exp(-dot(flash, flash) * 8.0) * (.18 + cover * .65);
        color = applyAtmosphere(color, cameraPosition + ray * 7000.0);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  const mountainPeriod = 7200;
  const mountainGeometry = asset('AlpineMassif');
  const distantMountainGeometry = asset('AlpineMassifDistant');
  const mountainMaterial = shader({
    uniforms: { ...atmosphere.uniforms, haze: { value: haze } },
    vertexShader: `
      uniform float ruggedness;
      uniform float terrainSeed;
      varying vec3 vWorld;
      varying vec3 vRock;
      varying vec3 vNormal;
      void main() {
        vec3 p = position;
        float phase = p.x / 7200.0 * 6.283185 * 7.0 + terrainSeed;
        float amplitude = (ruggedness - 1.0) * .25 + sin(terrainSeed) * .15;
        float stretch = 1.0 + sin(phase) * amplitude;
        float slope = cos(phase) * amplitude * 6.283185 * 7.0 / 7200.0;
        vNormal = normalize(mat3(modelMatrix)*vec3(normal.x - normal.y * p.y * slope / stretch, normal.y / stretch / (modelMatrix[1].y*modelMatrix[1].y), normal.z));
        p.y *= stretch;
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vRock = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 haze;
      varying vec3 vWorld;
      varying vec3 vRock;
      varying vec3 vNormal;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
      }
      void main() {
        vec3 normal = normalize(vNormal);
        float strata = noise(vRock.xz * .027 + vRock.y * .018);
        float grain = noise(vRock.xz * .14 + vRock.y * .073);
        float light = max(0.0, dot(normal, normalize(lightDirection))) * lightStrength;
        // Snow altitude is measured in world metres. The nearer ridge is
        // compressed vertically; source-space altitude painted bright caps
        // onto low foothills and made them look detached behind the city.
        float snowline = vWorld.y + strata * 140.0;
        float snow = smoothstep(snowLine - 160.0, snowLine + 160.0, snowline) * smoothstep(.25, .72, normal.y + strata * .28);
        vec3 rock = mix(rockColor, snowColor, snow * snowAmount);
        vec3 color = rock * (vec3(ambientStrength * .75) + keyColor * light * .55) * (.8 + strata * .28 + grain * .14);
        color += rock * stormLight(vWorld, normal) * 2.0;
        float distance = smoothstep(600.0, 5800.0, -vWorld.z);
        color = mix(color, haze, clamp(distance * .76 * hazeAmount, 0.0, .95));
        color = mix(color, haze, clamp(exp(-max(vWorld.y, 0.0) / 120.0) * .38 * hazeAmount, 0.0, .9));
        gl_FragColor = vec4(applyAtmosphere(color, vWorld), 1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const mountains = new Group();
  for (const [offset, front, scale] of [[1250, -2600, 1.12], [-750, -1430, .87], [400, -810, .39]]) {
    for (const copy of [-1, 0, 1]) {
      const ridge = new Mesh(front === -810 ? mountainGeometry : distantMountainGeometry, mountainMaterial);
      ridge.position.set(offset + copy * mountainPeriod, 0, front);
      ridge.scale.y = scale;
      ridge.userData = { height: scale, depth: front };
      mountains.add(ridge);
    }
  }
  if(settings.sequence?.enabled&&settings.sequence.bank){
    for(const [offset,depth,scale] of [[-600,1750,.57],[1400,2650,.92]]){
      const ridge=new Mesh(distantMountainGeometry,mountainMaterial);ridge.position.set(offset,0,depth);ridge.rotation.y=Math.PI;ridge.scale.y=scale;ridge.userData={height:scale,depth};mountains.add(ridge);
    }
  }
  scene.add(mountains);

  // Reflections share the facade shader; window detail adds no geometry.
  const facadeMaterial = shader({
    uniforms: { ...atmosphere.uniforms, time: clock, reflectionTravel: drift, haze: { value: haze } },
    vertexShader: `
      #ifndef LANDMARK
        attribute vec4 facade;
        attribute float surfaceRole;
      #endif
      uniform float time;
      uniform float waveHeight, waveLength, waveSpeed, waterLevel, reflectionTravel;
      ${waterWaveShader}
      #ifdef CROWN_DISPLAY
        varying vec2 vDisplayUv;
      #endif
      #if defined(CROWN_DISPLAY) || defined(OBSERVATORY_DISPLAY)
        #ifndef USE_UV1
          attribute vec2 uv1;
        #endif
      #endif
      #ifdef OBSERVATORY_DISPLAY
        varying vec2 vObservatoryUv;
      #endif
      uniform float distortion;
      uniform vec3 palette[9];
      varying float vRole;
      varying vec3 vFacadeNormal;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vTint;
      varying float vStyle;
      varying float vReflection;
      varying vec2 vReflectionWater;
      varying vec2 vLightSeed;
      void main() {
        vec3 surfacePosition = position, surfaceNormal = normal;
        #ifdef LANDMARK
          vStyle = uv.x >= .49 ? -1.0 : uv.x > .1 ? 1.0 : 0.0;
          vRole = floor((1.0 - uv.y) * 8.0 + .5);
          #ifdef CROWN_DISPLAY
            vDisplayUv = vec2(uv1.x, 1.0 - uv1.y);
          #endif
          #ifdef OBSERVATORY_DISPLAY
            vObservatoryUv = vec2(uv1.x, 1.0 - uv1.y);
          #endif
          vLocal = surfacePosition;
          vFacadeNormal = surfaceNormal;
          vTint = vRole > 8.5 ? color.rgb : color.rgb * palette[int(clamp(vRole, 0.0, 8.0))];
        #else
          vLocal = (position + .5) * facade.xyz;
          vFacadeNormal = normal;
          vStyle = facade.w;
          vRole = surfaceRole;
          vTint = instanceColor * palette[int(surfaceRole)];
        #endif
        vec3 p = (instanceMatrix * vec4(surfacePosition, 1.0)).xyz;
        // Keep each facade's light phases attached to the building as it pans.
        vLightSeed = mod(instanceMatrix[3].xz, vec2(2400.0)) * vec2(.173, .291);
        vec3 n = normalize(mat3(instanceMatrix) * surfaceNormal);
        vNormal = normalize(mat3(modelMatrix) * n);
        vec4 world = modelMatrix * vec4(p, 1.0);
        vReflection = step(dot(cross(modelMatrix[0].xyz, modelMatrix[1].xyz), modelMatrix[2].xyz), 0.0);
        float hit = clamp((waterLevel-cameraPosition.y) / min(-.001,world.y-cameraPosition.y),0.0,1.0);
        vReflectionWater = mix(cameraPosition.xz,world.xz,hit);
        if (vReflection > .5) {
          vec3 wave = waterSurface(vReflectionWater + vec2(reflectionTravel,0.0),time);
          world.x += wave.y * 14.0 * distortion;
          world.z += wave.z * 14.0 * distortion;
          world.y += wave.x * .3 * distortion;
        }
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 haze;
      #ifdef CROWN_DISPLAY
        uniform sampler2D crownDisplay;
        varying vec2 vDisplayUv;
      #endif
      #ifdef OBSERVATORY_DISPLAY
        uniform sampler2D observatoryDisplay;
        uniform float observatoryStart;
        varying vec2 vObservatoryUv;
      #endif
      varying float vRole;
      varying vec3 vFacadeNormal;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vTint;
      varying float vStyle;
      varying float vReflection;
      varying vec2 vReflectionWater;
      varying vec2 vLightSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lightVariation(vec2 address) {
        float phase = hash(address + 17.3), rate = hash(address + 43.7);
        float t = time * lightSpeed;
        float shimmer = .62 * sin(t * (7.0 + rate * 8.0) + phase * 62.83)
          + .38 * sin(t * (13.0 + phase * 11.0) + rate * 91.7);
        float dip = smoothstep(.78, .995, sin(t * (.7 + rate * 1.6) + phase * 83.0));
        float circuit = .5 + .5 * sin(t * (.08 + rate * .18) + phase * 53.0);
        return max(.08, 1.0 + lightLife * (.85 * shimmer - .65 * dip - .2 * circuit));
      }
      void main() {
        // Quays and piles extend below the water. Their mirrored undersides
        // must never rise above it and fight the real shoreline geometry.
        if (vReflection > .5 && vWorld.y > waterLevel) discard;
        // Keep the garage passage open through podiums and tower footings.
        // Use the same world-space cutout for the mirrored city geometry.
        if (garageActive > .5) {
          vec3 actual = vWorld;
          if (vReflection > .5) actual.y = waterLevel * 2.0 - actual.y;
          vec3 delta = actual - garageOrigin;
          float along = dot(delta.xz, garageAxis);
          float side = dot(delta.xz, vec2(-garageAxis.y, garageAxis.x));
          if (along > -55.0 && along < garageDepth + 8.0 && abs(side) < garageWidth * .5
              && delta.y > -2.0 && delta.y < garageHeight + .12) discard;
        }
        vec3 normal = normalize(vNormal);
        if (vReflection > .5) normal.y = -normal.y;
        float light = ambientStrength + max(0.0, dot(normal, normalize(lightDirection))) * lightStrength;
        vec3 color = vTint * (vec3(ambientStrength) + keyColor * (light - ambientStrength));
        float horizontal = abs(vFacadeNormal.z) > .5 ? vLocal.x : vLocal.z;
        vec2 panes = vec2(horizontal / 2.4, vLocal.y / 3.1) / windowScale;
        vec2 cell = fract(panes);
        vec2 aa = min(fwidth(panes), vec2(.3));
        float glass = smoothstep(.14 - aa.x, .14 + aa.x, cell.x) * (1.0 - smoothstep(.73 - aa.x, .73 + aa.x, cell.x))
          * smoothstep(.25 - aa.y, .25 + aa.y, cell.y) * (1.0 - smoothstep(.65 - aa.y, .65 + aa.y, cell.y));
        float id = hash(floor(panes) + floor(vStyle * 19.0));
        float windows = step(.5, vStyle) * (1.0 - step(.5, abs(vNormal.y)));
        float floorBand = smoothstep(.91, .98, fract(vLocal.y / 12.4));
        color *= 1.0 - windows * (.14 * glass + .23 * floorBand);
        vec3 lamp = mix(vec3(.69, .27, .058) * palette[2], vec3(.27, .34, .18) * palette[3], step(.88, id));
        float occupied = step(.57, hash(vec2(floor(panes.x / 3.0), floor(panes.y / 4.0)) + vStyle));
        float life = lightVariation(floor(panes) + vLightSeed);
        float lit = step(1.0 - windowDensity, id) * windows * (.16 + .38 * occupied) * windowBrightness * life;
        vec2 lampDistance = (cell - vec2(.435, .45)) / vec2(.6, .5);
        float spill = exp(-dot(lampDistance, lampDistance) * 2.5);
        color *= 1.0 - windows * .18 * (1.0 - smoothstep(.025, .09, fract(horizontal / 7.2)));
        color *= 1.0 - .12 * weathering + .12 * weathering * hash(floor(vec2(horizontal, vLocal.y) * .65 * textureScale));
        if (pattern > .5 && pattern < 1.5) color *= .72 + .28 * smoothstep(-.6, .6, sin(horizontal * 2.5 * textureScale));
        if (pattern > 1.5) color = mix(color, vTint * light * (.7 + id * .3), .72);
        vec3 halfLight = normalize(normalize(lightDirection) + normalize(cameraPosition - vWorld));
        color += keyColor * pow(max(0.0, dot(normal, halfLight)), 24.0) * metalness * lightStrength * .14;
        vec3 realWorld = vWorld;
        if (vReflection > .5) realWorld.y = waterLevel * 2.0 - vWorld.y;
        vec3 redDelta = corporateOrigin - realWorld, cyanDelta = observatoryOrigin - realWorld;
        float redSpill = exp(-dot(redDelta,redDelta)/15000.0) * (.16 + .84*max(0.0,dot(normal,normalize(redDelta))));
        float cyanSpill = exp(-dot(cyanDelta,cyanDelta)/6500.0) * (.16 + .84*max(0.0,dot(normal,normalize(cyanDelta))));
        if (vRole < 8.5) color += (signColor * signBrightness * redSpill + observatorySignColor * observatorySignBrightness * cyanSpill) * signSpill * .18;
        // Add emission after the facade finish so grime cannot dim the lights.
        color += lamp * lit * (glass + cityGlow * spill);
        if (vStyle < 0.0) {
          float accentLife = mix(1.0, lightVariation(vLightSeed + vec2(vStyle, vRole)), .18);
          color = vTint * windowBrightness * (vRole > 6.5 && vRole < 8.5 ? dockLights : 1.0) * (1.0 + cityGlow * .3) * accentLife;
        }
        // The LCD uses its own dimmer, independent of harbor and window lights.
        if (vRole > 8.5 && vRole < 11.5) color = vTint * signBrightness;
        #ifdef CROWN_DISPLAY
          if (vRole > 9.5 && vRole < 10.5) {
            vec2 caption = texture2D(crownDisplay, vec2(fract(vDisplayUv.x - time * signSpeed / 60.0), vDisplayUv.y)).rg;
            color = mix(color,signColor*signBrightness,caption.r);
            color += signColor * signBrightness * signGlow * caption.g * 2.4;
          }
        #endif
        #ifdef OBSERVATORY_DISPLAY
          if (vRole > 11.5 && vRole < 12.5) {
            vec2 caption = texture2D(observatoryDisplay, vec2(fract(vObservatoryUv.x - observatoryStart - time * observatorySignSpeed / 60.0), vObservatoryUv.y)).rg;
            color = vTint * light + observatorySignColor * observatorySignBrightness
              * (caption.r + caption.g * observatorySignGlow * 2.4);
          }
        #endif
        float beacon = step(3.5,vRole)*(1.0-step(4.5,vRole));
        if (beacon > .5) color = vTint * beaconBrightness * mix(1.0, .18 + .82 * pow(.5 + .5 * sin(time * 2.2 + vWorld.z * .17), 6.0), beaconPulse);
        if (vStyle < -1.5) color = mix(vec3(.014, .019, .013), vec3(.38, .21, .042) * palette[2], step(.5, fract((vLocal.x + vLocal.y) * .19)));
        color += (vTint + vec3(.035)) * stormLight(realWorld, normal) * 2.2;
        color = mix(color, haze, clamp(smoothstep(140.0, 1400.0, -vWorld.z) * .63 * hazeAmount, 0.0, .94));
        color = applyAtmosphere(color, realWorld);
        if (vReflection > .5) {
          vec2 p = vReflectionWater + vec2(airTravel,0.0);
          float ripple = .76 + .24 * sin(p.y * .78 + sin(p.x * .21) * 1.2 + time * waveSpeed);
          color *= ripple * .47 * reflections;
        }
        // HDR alpha carries a bloom-only gain, independent of opaque RGB.
        gl_FragColor = vec4(color, 1.0 + beacon * beaconGlow);
        #include <colorspace_fragment>
      }
    `
  });
  type Part = { x: number; y: number; z: number; w: number; h: number; d: number; tint: Color; style: number; angle?: number };
  const blocks: Part[] = [], rounds: Part[] = [];
  const steel = new Color('#444b40'), trim = new Color('#272e27');
  const warm = new Color('#e9a250').multiplyScalar(.65), cool = new Color('#a9b785').multiplyScalar(.45);
  let buildingGround = 2.4;
  function block(x: number, y: number, z: number, w: number, h: number, d: number, tint = trim, style = 0, parts = blocks) {
    parts.push({ x, y: y - 5 + buildingGround, z, w, h, d, tint, style });
  }
  const beacon = new Color('#ec4322').multiplyScalar(.8);
  for (const [row, rowZ, spacing, maximum] of [[0, -550, 59, 162], [1, -355, 47, 126], [2, -185, 37, 83]]) {
    const count = Math.floor(cityPeriod / spacing * settings.city.density);
    for (let i = 0; i < count; i++) {
      const x = -cityPeriod / 2 + (i + .5) * cityPeriod / count + (random() - .5) * 9;
      if (row === 1 && settings.landmarks.enabled && (Math.abs(x - settings.landmarks.gateX) < 75 * settings.landmarks.gateScale || Math.abs(x - settings.landmarks.spireX) < 55 * settings.landmarks.spireScale || Math.abs(x - settings.landmarks.observatoryX) < 70 * settings.landmarks.observatoryScale)) {
        continue;
      }
      const width = (13 + random() * (row === 2 ? 12 : 20)) * settings.city.width;
      const depth = (15 + random() * 19) * settings.city.width;
      const z = row === 2
        ? terrain.front(x, width * 1.6, depth * 1.6, 12 + 14 * (1 + terrain.noise(x, 67)))
        : rowZ + (terrain.coast(x) + 143) * .25 + terrain.noise(x, 23) * 24;
      buildingGround = terrain.foundation(x, z, width * 1.6, depth * 1.6);
      const district = .55 + .45 * Math.pow(Math.sin(x * .006 + row), 2);
      const height = (18 + Math.max(.03, .4 + (Math.pow(random(), 1.35) - .4) * settings.city.variation) * maximum * district) * settings.city.height;
      const tint = steel.clone().multiplyScalar(.7 + random() * .6);
      const style = 1 + random() * 20;
      const kind = Math.floor(random() * 5);
      // Consume the same seeded values before reserving the road. Changing its
      // location must not reshuffle all the surrounding building silhouettes.
      if(cityStreetClearance(x,width*1.6,settings))continue;
      if (kind === 0) {
        block(x, height / 2 + 5, z, width * 1.35, height, depth * 1.25, tint, style, rounds);
        block(x, height + 6, z, width * .94, 3, depth * .88, cool, -1, rounds);
        block(x, height + 12, z, width * .8, 9, depth * .76, trim, style, rounds);
      } else {
        const setback = kind === 1 || kind === 3;
        const shaft = setback ? height * .72 : height;
        block(x, shaft / 2 + 5, z, width, shaft, depth, tint, style);
        if (setback) {
          block(x, shaft + 5, z, width + 1.3, 1.4, depth + 1.3);
          block(x + width * .09, shaft + (height - shaft) / 2 + 5, z,
            width * .7, height - shaft, depth * .75, tint, style);
          block(x + width * .09, height + 5.5, z, width * .73, 1, depth * .78, cool, -1);
        } else {
          for (const side of [-1, 1]) block(x + side * width * .38, height / 2 + 5, z + depth / 2 + .45, .65, height + 1.5, 1.1);
          block(x, height + 5.8, z, width + 1, 1.6, depth + 1);
        }
        if (i % 10 / 10 < settings.city.roofDetail) block(x - width * .12, height + 8, z - depth * .1, width * .38, 5, depth * .46, trim, style);
        if (kind === 3 && i % 10 / 10 < settings.city.roofDetail) {
          block(x + width * .09, height + 18, z, .6, 24, .6);
          block(x + width * .09, height + 30.5, z, 1, 1, 1, beacon, -1);
        }
        if (kind === 2 && height > 55) {
          block(x - width * .3, height * .43, z + depth * .35, width * .54, height * .8, depth * .5, tint, style);
        }
      }
    }
  }
  const dock = new Color('#171d18'), edge = new Color('#3c4235');
  function build(parts: Part[], shape: BufferGeometry, fixed=false) {
    const repeated = fixed ? parts : [-1, 0, 1].flatMap(copy => parts.map(part => ({ ...part, x: part.x + copy * cityPeriod })));
    const dimensions = new Float32Array(repeated.length * 4);
    const roles = new Float32Array(repeated.length);
    const mesh = new InstancedMesh(shape, facadeMaterial, repeated.length);
    const transform = new Object3D();
    repeated.forEach((part, index) => {
      transform.position.set(part.x, part.y, part.z);
      transform.scale.set(part.w, part.h, part.d);
      transform.rotation.z = part.angle ?? 0;
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, part.tint);
      dimensions.set([part.w, part.h, part.d, part.style], index * 4);
      roles[index] = Math.max(0, [steel, trim, warm, cool, beacon, dock, edge].indexOf(part.tint));
      if (part.z > 0 && part.tint === warm) roles[index] = 7;
      if (part.z > 0 && part.tint === cool) roles[index] = 8;
    });
    shape.setAttribute('facade', new InstancedBufferAttribute(dimensions, 4));
    shape.setAttribute('surfaceRole', new InstancedBufferAttribute(roles, 1));
    mesh.userData.reflectionKind = 'city';
    mesh.userData.fixedWorld = fixed;
    mesh.computeBoundingSphere();
    scene.add(mesh); meshes.push(mesh);
    // Mirrored geometry avoids a second render pass for reflections.
    const reflection = new InstancedMesh(shape, facadeMaterial, repeated.length);
    reflection.instanceMatrix = mesh.instanceMatrix;
    reflection.instanceColor = mesh.instanceColor;
    reflection.scale.y = -1;
    reflection.userData.reflectionKind = 'city';
    reflection.userData.fixedWorld = fixed;
    reflection.computeBoundingSphere();
    scene.add(reflection); meshes.push(reflection);
  }
  build(blocks, geometry(new BoxGeometry()));
  build(rounds, geometry(new CylinderGeometry(.38, .5, 1, 8)));
  if(settings.sequence?.enabled&&settings.sequence.bank&&settings.sequence.bankBuildings>0){
    const bankBlocks:Part[]=[],bankRandom=seededRandom(settings.seed^0x619ed);
    const center=routeDistrictCenter(settings);
    for(const [row,z,spacing,maxHeight] of [[0,settings.camera.distance+60,46,42],[1,settings.camera.distance+155,69,86],[2,settings.camera.distance+330,93,145]]){
      const count=Math.round(3200/spacing*settings.sequence.bankBuildings);
      for(let i=0;i<count;i++){
        const x=center-1600+(i+.5)*3200/count+(bankRandom()-.5)*8,w=14+bankRandom()*18,d=17+bankRandom()*20,h=(12+bankRandom()*maxHeight)*settings.city.height*.65;
        if(row<2&&bankStreetDistance(x,settings)<w/2+7)continue;
        const tint=steel.clone().multiplyScalar(.65+bankRandom()*.45),style=1+bankRandom()*20;
        buildingGround=nearBankHeight(x,z,settings)-.3;
        block(x,h/2+5,z,w,h,d,tint,style,bankBlocks);
        block(x,h+5.6,z,w+1.2,1.2,d+1.2,trim,0,bankBlocks);
        block(x-w*.15,h+7,z,w*.35,2,d*.4,trim,style,bankBlocks);
        if(row===0){block(x,7,z-d/2-1,w*.78,3,2,trim,style,bankBlocks);block(x,9,z-d/2-2,w*.8,.35,2.4,trim,0,bankBlocks);}
      }
    }
    build(bankBlocks,geometry(new BoxGeometry()),true);
  }

  const landmarkMaterial = facadeMaterial.clone();
  landmarkMaterial.uniforms = facadeMaterial.uniforms;
  landmarkMaterial.defines = { LANDMARK: 1 };
  landmarkMaterial.vertexColors = true;
  materials.push(landmarkMaterial);
  const displayTextures: Texture[] = [];
  const podiums:Part[]=[];
  const observatoryDisplays: ReturnType<typeof createObservatoryDisplay>[] = [];
  for (const { name, x, z, scale } of settings.landmarks.enabled ? [
    { name: 'CrownGate', x: settings.landmarks.gateX, z: -375, scale: settings.landmarks.gateScale },
    { name: 'TwistingSpire', x: settings.landmarks.spireX, z: -440, scale: .94 * settings.landmarks.spireScale },
    { name: 'OrbitalObservatory', x: settings.landmarks.observatoryX, z: -420, scale: 1.1 * settings.landmarks.observatoryScale }
  ] : []) {
    const shape = asset(name);
    shape.computeBoundingBox();
    const { min, max } = shape.boundingBox!;
    const base = terrain.foundation(x + (min.x + max.x) * scale / 2, z + (min.z + max.z) * scale / 2,
      (max.x - min.x) * scale, (max.z - min.z) * scale);
    if(name==='CrownGate'){
      // Enclose the exposed flared footings in a grounded service podium. The
      // authored tower, ring and runtime display bindings retain their transforms.
      const w=(max.x-min.x)*scale+2,d=(max.z-min.z)*scale+2,h=7.2*scale;
      podiums.push({x,y:base+h/2-.5,z,w,h:h+1,d,tint:steel,style:0});
      podiums.push({x,y:base+h+.18,z,w:w+1.2,h:.36,d:d+1.2,tint:trim,style:0});
      for(let dx=-w/2+10;dx<w/2;dx+=18){
        podiums.push({x:x+dx,y:base+h*.5,z:z+d/2+.13,w:.28,h:h-.6,d:.3,tint:trim,style:0});
        podiums.push({x:x+dx,y:base+h*.38,z:z+d/2+.19,w:11,h:3.8,d:.08,tint:trim,style:0});
      }
    }
    let material = landmarkMaterial;
    const source = assets.getObjectByName(name) as Mesh;
    if (source.userData.waterfrontDisplay && shape.hasAttribute('uv1')) {
      const sourceMaterial = Array.isArray(source.material) ? source.material[0] : source.material;
      const baked = source.userData.waterfrontDisplayMask === 1 && 'map' in sourceMaterial ? sourceMaterial.map as Texture : undefined;
      const display = createCrownDisplay(source.geometry,shape,baked);
      displayTextures.push(display);
      material = landmarkMaterial.clone();
      material.defines = { LANDMARK: 1, CROWN_DISPLAY: 1 };
      material.uniforms = { ...landmarkMaterial.uniforms,
        crownDisplay: { value: display }
      };
      materials.push(material);
    }
    if (source.userData.waterfrontStaticDisplay && shape.hasAttribute('uv1')) {
      const display = createObservatoryDisplay(source.userData.waterfrontStaticDisplay);
      observatoryDisplays.push(display); displayTextures.push(display.texture);
      material = landmarkMaterial.clone();
      material.defines = { LANDMARK: 1, OBSERVATORY_DISPLAY: 1 };
      material.uniforms = { ...landmarkMaterial.uniforms,
        observatoryDisplay: { value: display.texture }, observatoryStart: display.start
      };
      materials.push(material);
    }
    const transform = new Object3D();
    {
      // One authored landmark and its water mirror. Only generic city blocks repeat.
      const mesh = new InstancedMesh(shape, material, 1);
      mesh.name = name; mesh.userData.landmarkX = x;
      transform.position.set(x, base, z);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      mesh.setMatrixAt(0, transform.matrix);
      mesh.computeBoundingSphere();
      const reflection = new InstancedMesh(shape, material, 1);
      reflection.name = name + ' / water reflection'; reflection.userData.landmarkX = x;
      reflection.userData.reflectionKind = 'landmark';
      reflection.instanceMatrix = mesh.instanceMatrix;
      reflection.scale.y = -1;
      reflection.computeBoundingSphere();
      scene.add(mesh, reflection);
      meshes.push(mesh, reflection);
    }
  }

  if(podiums.length)build(podiums,geometry(new BoxGeometry()),true);

  const water = new Mesh(geometry(new PlaneGeometry(2, 2, 64, 24)), shader({
    transparent: true, depthWrite: false,
    uniforms: { ...atmosphere.uniforms, time: clock, travel: drift, waterForward: { value: new Vector2(0, -1) }, waterSpan: { value: 1 } },
    vertexShader: `
      uniform float time; uniform float travel; uniform float waveHeight; uniform float waveLength; uniform float waveSpeed; uniform float waterLevel;
      uniform vec2 waterForward; uniform float waterSpan;
      varying vec3 vWorld; varying vec3 vWaveNormal;
      ${waterWaveShader}
      void main() {
        float row = uv.y;
        float distance = row < .78 ? .1 + pow(row / .78, 2.0) * 220.0
          : 220.1 * pow(65.0, (row - .78) / .22);
        float across = (uv.x * 2.0 - 1.0) * (distance + 2.0) * waterSpan * 1.4;
        vec2 p = cameraPosition.xz + waterForward * distance + vec2(-waterForward.y, waterForward.x) * across;
        vec3 wave = waterSurface(p + vec2(travel, 0.0), time);
        vWorld = vec3(p.x, waterLevel + wave.x, p.y);
        vWaveNormal = normalize(vec3(-wave.y, 1.0, -wave.z));
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float travel;
      varying vec3 vWorld;
      varying vec3 vWaveNormal;
      float impactHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main() {
        float distance = length(cameraPosition.xz - vWorld.xz);
        vec2 p = vec2(vWorld.x + travel,vWorld.z);
        vec2 windAxis = normalize(vec2(wind*.009,1.0));
        float fine = dot(p,windAxis) * 1.65 * waveScale - time * .7 * waveSpeed;
        float cross = dot(p,vec2(windAxis.y,-windAxis.x)) * 2.1 * waveScale + sin(fine*.23);
        vec2 slope = (cos(fine)*windAxis + .45*cos(cross)*vec2(windAxis.y,-windAxis.x))
          * .018 * rippleStrength * (1.0-smoothstep(45.0,850.0,distance));
        vec2 cell=floor(p*1.2), local=fract(p*1.2)-.5;
        float phase=fract(time*1.4+impactHash(cell));
        float radius=length(local);
        float impact=exp(-pow((radius-phase*.5)*35.0,2.0))*(1.0-phase)*step(.78,impactHash(cell+3.7));
        slope += normalize(local+.001)*impact*.012*rainRipples*(1.0-smoothstep(12.0,65.0,distance));
        vec3 normal=normalize(vWaveNormal+vec3(slope.x,0.0,slope.y));
        vec3 view=normalize(cameraPosition-vWorld), reflected=reflect(-view,normal);
        float fresnel=.025+.975*pow(1.0-max(0.0,dot(normal,view)),5.0);
        vec3 skyLight=mix(horizonColor,skyTop,smoothstep(0.0,.65,reflected.y));
        float cover=ceilingCover(reflected);
        skyLight=mix(skyLight,cloudColor*(.5+.5*weatherMass(weatherPosition(vWorld+reflected*5000.0)))+cloudIllumination(reflected,vWorld),cover);
        float moonOpening=exp(-pow(length(reflected-moonDirection)/(.12+waterRoughness*.3),2.0));
        skyLight += moonColor * moonOpening * moonBrightness * .028 * (1.0-cover*.75);
        float gleam=pow(max(0.0,dot(normal,normalize(view+normalize(lightDirection)))),mix(90.0,12.0,waterRoughness));
        float far = smoothstep(150.0, 950.0, distance);
        vec3 color = mix(waterNear, waterFar, far);
        color = mix(color,skyLight*skyReflection,fresnel*.55);
        color += waterGlint * gleam * lightStrength * .25;
        color += stormLight(vWorld, vec3(0.0, 1.0, 0.0)) * (.1 + gleam * .6);
        float alpha=mix(.94,.62,clamp(fresnel*reflections,0.0,1.0));
        alpha=mix(alpha,1.0,1.0-exp(-routeFogDepth(vWorld)-streetFogDepth(vWorld)));
        gl_FragColor = vec4(applyAtmosphere(color,vWorld), alpha);
        #include <colorspace_fragment>
      }
    `
  }));
  water.frustumCulled = false;
  scene.add(water);

  // Wrap both streak endpoints together to avoid flashes at the boundary.
  const rainPositions: number[] = [], rainTrails: number[] = [], rainDepths: number[] = [];
  for (let i = 0; i < 1140; i++) {
    const depth = i % 45 === 0 ? 12 + random() * 22 : 55 + random() * 420;
    const x = (random() - .5) * depth * 2.8, y = random() * 250;
    for (const [side,trail] of [[-1,0],[1,1],[1,0],[-1,0],[-1,1],[1,1]]) {
      rainPositions.push(x,y,0);rainTrails.push(side,trail);rainDepths.push(depth);
    }
  }
  const rainGeometry = geometry(new BufferGeometry());
  rainGeometry.setAttribute('position', new Float32BufferAttribute(rainPositions, 3));
  rainGeometry.setAttribute('trail', new Float32BufferAttribute(rainTrails, 2));
  rainGeometry.setAttribute('rainDepth', new Float32BufferAttribute(rainDepths, 1));
  const rain = new Mesh(rainGeometry, shader({
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: { time: clock, rainResolution: {value:new Vector2(1,1)}, rainCameraZ: {value:initial.camera.distance} },
    vertexShader: `
      uniform float time;
      uniform float rainSpeed;
      uniform float wind;
      uniform float rainLength;
      uniform float rainCameraZ;
      uniform vec2 rainResolution;
      attribute vec2 trail;
      attribute float rainDepth;
      varying float fade;
      varying vec2 vRainUv;
      varying vec3 vRainWorld;
      void main() {
        vec3 p = position;
        p.z = rainCameraZ-rainDepth;
        float span=rainDepth*2.8;
        p.x = mod(p.x + time * wind * .3 + span*.5,span)-span*.5;
        p.y = mod(p.y - time * 58.0 * rainSpeed, 250.0) - 25.0;
        vec3 streak=vec3(-wind/100.0,1.4,0.0)*rainLength*mix(1.8,.65,smoothstep(20.0,300.0,rainDepth));
        p += streak*trail.y;
        vec4 clip=projectionMatrix*modelViewMatrix*vec4(p,1.0);
        vec4 other=projectionMatrix*modelViewMatrix*vec4(p+streak,1.0);
        vec2 axis=normalize((other.xy/other.w-clip.xy/clip.w)*rainResolution);
        float width=mix(2.1,.55,smoothstep(20.0,150.0,rainDepth));
        clip.xy += vec2(-axis.y,axis.x)*trail.x*width/rainResolution*clip.w;
        fade = smoothstep(-20.0, 2.0, p.y) * (1.0 - smoothstep(175.0, 225.0, p.y));
        fade *= mix(.12,.045,smoothstep(20.0,400.0,rainDepth));
        vRainUv=vec2(trail.x,trail.y);vRainWorld=(modelMatrix*vec4(p,1.0)).xyz;
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      varying float fade;
      varying vec2 vRainUv;
      varying vec3 vRainWorld;
      void main() {
        float soft=exp(-vRainUv.x*vRainUv.x*3.5)*sin(vRainUv.y*3.14159);
        vec3 delta=corporateOrigin-vRainWorld;
        float red=exp(-dot(delta,delta)/15000.0)*signBrightness*.1;
        vec3 color=rainColor+signColor*red;
        gl_FragColor = vec4(color, fade*soft);
        #include <colorspace_fragment>
      }
    `
  }));
  rain.frustumCulled = false;
  rain.renderOrder = 5;
  scene.add(rain);

  let width = 0, height = 0, pixelBudget = 0, density = 0;
  return {
    setCabin(asset: Group) { driving.setCabin(asset); },
    configure(next: LandscapeConfig) {
      settings = next;
      const { city, docks, mountains: terrain, lighting: light, weather: air, water: sea } = settings;
      const u = uniforms, warmth = light.temperature;
      cinema.configure(settings.cinema);
      atmosphere.configure(settings);
      shoreline.configure(settings); driving.configure(settings);
      u.cityGlow.value = city.glow; u.lightLife.value = city.lightLife; u.lightSpeed.value = city.lightSpeed;
      u.beaconPulse.value = city.beaconPulse;
      u.beaconBrightness.value=city.beaconBrightness;u.beaconGlow.value=city.beaconGlow;
      u.signBrightness.value = settings.landmarks.signBrightness;
      u.signSpeed.value = settings.landmarks.signSpeed;
      u.signColor.value.set(settings.landmarks.signColor); u.signGlow.value = settings.landmarks.signGlow;
      u.observatorySignBrightness.value = settings.landmarks.observatorySignBrightness;
      u.observatorySignSpeed.value = settings.landmarks.observatorySignRotate
        ? settings.landmarks.observatorySignSpeed * (settings.landmarks.observatorySignReverse ? -1 : 1) : 0;
      u.observatorySignColor.value.set(settings.landmarks.observatorySignColor); u.observatorySignGlow.value = settings.landmarks.observatorySignGlow;
      for (const display of observatoryDisplays) display.configure(settings.landmarks);
      u.sceneTint.value.setRGB(light.exposure * (1 + warmth * .25), light.exposure * (1 - Math.abs(warmth) * .1), light.exposure * (1 - warmth * .35));
      u.lightDirection.value.setFromSphericalCoords(1, (90 - light.elevation) * Math.PI / 180, light.azimuth * Math.PI / 180);
      u.lightStrength.value = light.strength;
      u.keyColor.value.set(light.keyColor); u.ambientStrength.value = light.ambient; u.signSpill.value = light.signSpill;
      [city.buildingColor, city.trimColor, city.windowColor, city.accentColor, city.beaconColor, docks.color, docks.edgeColor, city.windowColor, city.accentColor].forEach((value, index) => {
        const color = u.palette.value[index].set(value), base = paletteBase[index];
        color.r /= base.r; color.g /= base.g; color.b /= base.b;
      });
      for (const name of ['windowBrightness', 'windowDensity', 'windowScale', 'textureScale', 'weathering', 'metalness'] as const) u[name].value = city[name];
      u.pattern.value = ['panels', 'ribbed', 'concrete'].indexOf(city.pattern); u.dockLights.value = docks.lights;
      u.skyTop.value.set(light.skyColor); u.horizonColor.value.set(light.horizonColor); u.sunColor.value.set(light.sunColor);
      u.sunGlow.value = light.sunGlow; haze.set(light.hazeColor); u.hazeAmount.value = light.haze;
      u.moonBrightness.value = light.moon ? light.moonBrightness : 0;
      u.moonColor.value.set(light.moonColor);u.moonGlow.value=light.moon?light.moonGlow:0;u.moonGlowRadius.value=light.moonGlowRadius;
      const moon = moonAnchor(settings);
      u.moonDirection.value.copy(moon.direction); atmosphere.uniforms.airMoon.value.copy(moon.direction);
      sky.material.uniforms.skyReference.value.copy(moon.reference); sky.material.uniforms.skyTangent.value = moon.tangent;
      u.moonX.value = light.moonX; u.moonY.value = light.moonY; u.moonSize.value = light.moonSize;
      u.cloudColor.value.set(air.cloudColor);
      for (const name of ['cloudCover', 'cloudScale', 'cloudSpeed', 'rainSpeed', 'wind', 'rainLength'] as const) u[name].value = air[name];
      u.rainColor.value.set(air.rainColor); u.fogAmount.value = air.fog;
      rain.visible = air.rainEnabled && air.rain > 0; rainGeometry.setDrawRange(0, Math.min(1140,Math.round(380 * air.rain)) * 6);
      rain.material.uniforms.rainCameraZ.value=next.camera.distance;
      mountains.visible = terrain.enabled;
      for (const ridge of mountains.children) { ridge.scale.y = ridge.userData.height * terrain.height; ridge.position.z = ridge.userData.depth * terrain.distance; }
      u.rockColor.value.set(terrain.rockColor); u.snowColor.value.set(terrain.snowColor);
      u.snowLine.value = terrain.snowLine; u.snowAmount.value = terrain.snowAmount; u.ruggedness.value = terrain.ruggedness;
      u.terrainSeed.value = (settings.seed - 8127) * .001;
      u.waterNear.value.set(sea.nearColor); u.waterFar.value.set(sea.farColor); u.waterGlint.value.set(sea.glintColor);
      for (const name of ['waveScale', 'waveSpeed', 'waveHeight', 'waveLength', 'waterLevel', 'rippleStrength', 'reflections', 'distortion'] as const) u[name].value = sea[name];
      u.skyReflection.value=sea.skyReflection;u.waterRoughness.value=sea.roughness;u.rainRipples.value=air.rainEnabled?sea.rainRipples*air.rain:0;
      u.reflections.value=sea.reflectionEnabled?sea.reflections:0;
      for (const mesh of meshes) if (mesh.scale.y < 0) mesh.position.y = sea.waterLevel * 2;
      for (const mesh of meshes) if (mesh.scale.y < 0) mesh.visible=sea.reflectionEnabled && (sea.reflectionDetail==='full'||mesh.userData.reflectionKind==='landmark');
      water.visible = sea.enabled;
      const lens = settings.camera;
      camera.position.set(0, lens.height, lens.distance);
      camera.lookAt(Math.tan(lens.yaw * Math.PI / 180) * (lens.distance + 700), lens.targetHeight, -700);
      camera.rotateZ(lens.roll * Math.PI / 180); camera.fov = lens.fov; camera.updateProjectionMatrix();
      water.material.uniforms.waterForward.value.set(Math.sin(lens.yaw * Math.PI / 180), -Math.cos(lens.yaw * Math.PI / 180));
      water.material.uniforms.waterSpan.value = Math.tan(lens.fov * Math.PI / 360) * camera.aspect;
    },
    resize(nextWidth: number, nextHeight: number) {
      if (!nextWidth || !nextHeight || (width === nextWidth && height === nextHeight && pixelBudget === settings.quality.megapixels && density === getPixelRatio())) return;
      width = nextWidth; height = nextHeight; pixelBudget = settings.quality.megapixels;
      density = getPixelRatio();
      renderer.setPixelRatio(Math.min(density, 1.5, Math.sqrt(pixelBudget * 1_000_000 / (width * height))));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      sky.material.uniforms.aspect.value = camera.aspect;
      water.material.uniforms.waterSpan.value = Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
      const size = renderer.getDrawingBufferSize(new Vector2());
      rain.material.uniforms.rainResolution.value.copy(size);
      cinema.resize(size.x, size.y); lightning.resize(size.x, size.y);
    },
    async prepare() {
      lightning.mesh.visible = lightning.reflection.visible = true;
      await cinema.prepare(scene, camera);
      lightning.mesh.visible = lightning.reflection.visible = false;
    },
    previewLightning(cue: number, paused: boolean) { lightning.preview(cue, paused); },
    render(seconds: number, reducedMotion: boolean, paused: boolean) {
      clock.value = reducedMotion ? 0 : seconds;
      const frame = sequenceFrame(reducedMotion ? Infinity : seconds, settings, camera.aspect);
      const travel = frame.travel;
      const garage=settings.sequence.garage,entry=garagePlacement(settings);
      uniforms.garageActive.value=settings.sequence.enabled&&garage.enabled?1:0;
      uniforms.garageOrigin.value.set(entry.x-travel,entry.y,entry.z);
      uniforms.garageAxis.value.set(Math.cos(entry.heading),-Math.sin(entry.heading));
      uniforms.garageWidth.value=garage.width;uniforms.garageHeight.value=garage.height;uniforms.garageDepth.value=garage.depth;
      const inside=settings.sequence.enabled&&garage.enabled&&seconds*1000>garageSchedule(settings).entryAtMs;
      rain.visible=settings.weather.rainEnabled&&settings.weather.rain>0&&!inside;
      camera.position.fromArray(frame.camera);
      if(frame.up)camera.up.fromArray(frame.up);else camera.up.set(0,1,0);
      camera.lookAt(...frame.target);
      camera.rotateZ(frame.roll);
      camera.fov = frame.fov;
      camera.near = settings.sequence?.enabled ? .03 : 1;
      camera.updateProjectionMatrix();
      water.material.uniforms.waterForward.value.set(frame.target[0]-frame.camera[0], frame.target[2]-frame.camera[2]).normalize();
      water.material.uniforms.waterSpan.value = Math.tan(frame.fov * Math.PI / 360) * camera.aspect;
      rain.position.set(0, camera.position.y - settings.camera.height, 0);
      drift.value = travel;
      camera.updateMatrixWorld();
      sky.material.uniforms.skyCamera.value.setFromMatrix4(camera.matrixWorld);
      sky.material.uniforms.skyInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.corporateOrigin.value.set(settings.landmarks.gateX-travel,181.5*settings.landmarks.gateScale,-375);
      uniforms.observatoryOrigin.value.set(settings.landmarks.observatoryX-travel,145*1.1*settings.landmarks.observatoryScale,-420);
      for (const mesh of meshes) mesh.position.x = mesh.userData.fixedWorld || mesh.userData.landmarkX !== undefined ? -travel : -wrap(travel, cityPeriod);
      mountains.position.x = -wrap(travel * settings.mountains.parallax, mountainPeriod);
      shoreline.update(travel, camera);
      driving.update(seconds, travel, reducedMotion);
      lightning.update(seconds, travel, settings, camera, reducedMotion, paused);
      lightning.reflection.position.y += settings.water.waterLevel * 2;
      renderer.info.reset(); cinema.render(scene, camera, seconds, garageFade(reducedMotion?Infinity:seconds*1000,settings));
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      for (const item of geometries) item.dispose();
      for (const material of materials) material.dispose();
      weatherNoise.dispose();
      for (const texture of displayTextures) texture.dispose();
      lightning.dispose();
      shoreline.dispose(); driving.dispose();
      scene.clear();
    }
  };
}
