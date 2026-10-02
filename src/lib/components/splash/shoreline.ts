import { Box3, BoxGeometry, BufferGeometry, Color, DynamicDrawUsage, Float32BufferAttribute, Frustum, Group, IcosahedronGeometry, InstancedMesh, Matrix3, Matrix4, Object3D, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { lightningLighting } from './lightning';
import { seededRandom } from './landscape-math';
import { coastPeriod, createShoreProfile } from './shoreline-math';
import { atmosphereShader } from './atmosphere';
import { routeLayout, cityStreetGround } from './driving-route';

/** Shared city terrain with an engineered quay or the optional natural shore. */
export function createShoreline(config: LandscapeConfig, shared: ShaderMaterial['uniforms']) {
  const positions: number[] = [], normals: number[] = [], roles: number[] = [], indices: number[] = [];
  const profile = createShoreProfile(config.seed, config.docks), docks = config.docks;
  const random = seededRandom(config.seed ^ 0x72bd53);
  const point = new Vector3(), normalMatrix = new Matrix3(), transform = new Object3D();
  const cube = new BoxGeometry(), rock = new IcosahedronGeometry(1, 0);
  function append(shape: BufferGeometry, role: number) {
    const start = positions.length / 3, p = shape.getAttribute('position'), n = shape.getAttribute('normal');
    normalMatrix.getNormalMatrix(transform.matrix);
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).applyMatrix4(transform.matrix); positions.push(point.x, point.y, point.z);
      point.fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix); normals.push(point.x, point.y, point.z);
      roles.push(role);
    }
    if (shape.index) for (const index of shape.index.array) indices.push(start + index);
    else for (let i = 0; i < p.count; i++) indices.push(start + i);
  }
  function solid(shape: BufferGeometry, x: number, y: number, z: number, w: number, h: number, d: number, role: number, yaw = 0, tilt = 0) {
    transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.rotation.set(tilt, yaw, tilt * .6); transform.updateMatrix();
    append(shape, role);
  }
  // Quay terrain drops beneath the retaining panels; natural terrain slopes
  // underwater. Inland rows rise gently under the city buildings.
  const depths = docks.quay ? [-20,-10,-.1,0,8,20,42,75,120,190,290,430,620,800] : [-20, -10, 0, 8, 20, 42, 75, 120, 190, 290, 430, 620, 800];
  const groundPositions: number[] = [], groundIndices: number[] = [], segments = 300;
  const columns=Array.from({length:segments+1},(_,i)=>-coastPeriod/2+i*coastPeriod/segments);
  if(config.sequence.enabled&&config.sequence.bridge){
    const {landingX}=routeLayout(config),half=config.sequence.roadWidth/2+config.sequence.shoulder;
    for(const offset of [-half-12,-half,0,half,half+12])if(Math.abs(landingX+offset)<coastPeriod/2)columns.push(landingX+offset);
    columns.sort((a,b)=>a-b);
  }
  for (let i = 0; i < columns.length; i++) {
    const x = columns[i];
    for (const depth of depths) {
      const z = profile.coast(x) - depth;
      const y=profile.height(x,z);
      groundPositions.push(x,depth<0?y:cityStreetGround(x,z,y,config),z);
    }
    if (i === columns.length-1) continue;
    for (let j = 0; j < depths.length - 1; j++) {
      const a = i * depths.length + j, b = a + depths.length;
      groundIndices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const ground = new BufferGeometry();
  ground.setAttribute('position', new Float32BufferAttribute(groundPositions, 3));
  ground.setIndex(groundIndices); ground.computeVertexNormals();
  transform.updateMatrix(); append(ground, 0); ground.dispose();

  if (docks.enabled) {
    const count = docks.quay ? 0 : Math.round(95 * docks.density);
    for (let i = 0; i < count; i++) {
      const center = -coastPeriod / 2 + (i + random()) / count * coastPeriod;
      const cluster = 1 + Math.floor(random() * 3);
      for (let j = 0; j < cluster; j++) {
        const x = center + (random() - .5) * 15;
        const z = profile.coast(x) + (random() - .45) * 15;
        const size = (.9 + random() * 3.7) * docks.scale;
        solid(rock, x, profile.height(x, z) - size * .3, z, size * (1 + random()), size * (.6 + random() * .45), size * (1 + random() * .8), 1, random() * Math.PI, (random() - .5) * .4);
      }
    }
    if(docks.quay){
      const count=Math.ceil(coastPeriod/docks.panelWidth),span=coastPeriod/count;
      for(let i=0;i<count;i++){
        const x=-coastPeriod/2+(i+.5)*span,z=profile.coast(x),top=profile.height(x,z),bottom=-5;
        const slope=(profile.coast(x+span/2)-profile.coast(x-span/2))/span,yaw=-Math.atan(slope),length=span*Math.sqrt(1+slope*slope)+.08;
        const dx=Math.cos(yaw),dz=-Math.sin(yaw);
        const part=(along:number,out:number,y:number,w:number,h:number,d:number,role:number)=>solid(cube,x+dx*along-dz*out,y,z+dz*along+dx*out,w,h,d,role,yaw);
        part(0,.06,(top+bottom)/2,length,top-bottom,.28,5);
        part(-length/2,.19,(top+bottom)/2,.24,top-bottom,.65,3);
        part(0,-1.1,top+.09,length,.22,2.8,6);
        part(0,-.04,top+.24,length,.22,.48,3);
        // Handrail and regularly spaced posts; access ladders interrupt the rail.
        const ladder=i%15===4;
        if(!ladder)part(0,-.1,top+1.25,length,.08,.08,3);
        else for(const side of [-1,1])part(side*(length/4+.2),-.1,top+1.25,length/2-.4,.08,.08,3);
        for(let a=-length/2+.6;a<length/2;a+=2)if(!ladder||Math.abs(a)>.45)part(a,-.1,top+.76,.07,1.05,.07,3);
        if(i%3===0){
          part(0,.52,.15,.72,2.7,.75,7);
          for(const y of [-.65,.3,1.2])part(0,.95,y,.87,.17,.16,7);
          part(-1.4,-1.3,top+.28,.9,.35,.8,3);part(-1.4,-1.3,top+.53,.25,.45,.25,3);
        }
        if(ladder){
          for(const side of [-1,1])part(side*.29,.49,(top+.3)/2,.065,top+.9,.09,3);
          for(let y=.15;y<top+.4;y+=.34)part(0,.51,y,.63,.045,.11,6);
          part(1.1,-.15,top+1.35,.18,.18,.18,4);
        }
        // Service conduit sits below the cap, with small brackets at every rib.
        part(0,.33,top-.48,length,.10,.10,3);part(-length/2,.35,top-.48,.22,.25,.25,3);
      }
    }
    if (docks.pier) {
      // One modest landing in the visible camera run, attached to dry land.
      const x = 340, z = profile.coast(x), slope = (profile.coast(x + 1) - profile.coast(x - 1)) / 2;
      const yaw = -Math.atan(slope), dx = Math.sin(yaw), dz = Math.cos(yaw);
      const level = profile.height(x - dx * 12, z - dz * 12) + .45;
      function pierBox(across: number, along: number, y: number, w: number, h: number, d: number, role: number) {
        solid(cube, x + dz * across + dx * along, y, z - dx * across + dz * along, w, h, d, role, yaw);
      }
      pierBox(0, 14, level, 11, .9, 56, 2);
      for (const along of [-8, 8, 24, 40]) for (const side of [-1, 1]) {
        pierBox(side * 4.5, along, (level - 5) / 2, .9, level + 5, .9, 3);
        pierBox(side * 5.1, along, level + 1.25, .3, 2, .3, 3);
      }
      for (const side of [-1, 1]) {
        pierBox(side * 5.1, 16, level + 2.2, .2, .18, 48, 3);
        pierBox(side * 4.4, 37, level + .8, .85, 1.3, .85, 3);
        pierBox(side * 4.4, 37, level + 1.5, .7, .22, .7, 4);
      }
      pierBox(-4.4, -8, level + 1.5, .7, .22, .7, 4);
    }
  }
  cube.dispose(); rock.dispose();
  const shape = new BufferGeometry();
  shape.setAttribute('position', new Float32BufferAttribute(positions, 3));
  shape.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  shape.setAttribute('surface', new Float32BufferAttribute(roles, 1));
  shape.setIndex(indices); shape.computeBoundingSphere(); shape.computeBoundingBox();
  const palette = Array.from({ length: 8 }, () => new Color());
  const material = new ShaderMaterial({ uniforms: { ...shared, shorePalette: { value: palette }, shoreLights: { value: docks.lights } }, vertexShader: `
    attribute float surface; varying float vSurface; varying float vReflection;
    varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
    void main() {
      mat4 transform = modelMatrix * instanceMatrix;
      vec4 world = transform * vec4(position, 1.0);
      vSurface = surface; vLocal = position; vWorld = world.xyz;
      vNormal = normalize(mat3(transform) * normal); vReflection = step(modelMatrix[1].y, 0.0);
      gl_Position = projectionMatrix * viewMatrix * world;
    }`, fragmentShader: lightningLighting + atmosphereShader + `
    uniform vec3 shorePalette[8]; uniform vec3 sceneTint; uniform vec3 lightDirection; uniform float lightStrength;
    uniform float shoreLights; uniform float reflections; uniform float time; uniform vec3 haze; uniform float hazeAmount; uniform float waterLevel;
    varying float vSurface; varying float vReflection; varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      if (vReflection > .5 && vWorld.y > waterLevel) discard;
      vec3 base = shorePalette[int(vSurface + .5)];
      float stain = .5 + .5 * sin(vLocal.x * .043 + sin(vLocal.z * .14)) * sin(vLocal.z * .11 + vLocal.x * .023);
      base *= .76 + .17 * stain + .12 * hash(floor(vLocal.xz * 3.0));
      if (vSurface < 1.5) base *= .48 + .52 * smoothstep(-.2, 2.5, vLocal.y);
      if (vSurface > 1.5 && vSurface < 2.5) base *= .72 + .28 * smoothstep(.02, .12, fract(vLocal.z * 1.5));
      vec3 n = normalize(vNormal);
      if (vReflection > .5) n.y = -n.y;
      vec3 color = base * (.35 + .65 * max(0.0, dot(n, normalize(lightDirection))) * lightStrength);
      color += (base + .025) * stormLight(vWorld, n) * 2.0;
      if (vSurface > 3.5 && vSurface < 4.5) color = base * shoreLights * .35;
      if(vSurface>4.5){
        color*=.78+.22*smoothstep(-1.0,3.0,vWorld.y);
        float sheen=pow(max(0.0,dot(n,normalize(normalize(cameraPosition-vWorld)+normalize(lightDirection)))),28.0);
        color+=vec3(.22,.27,.29)*sheen*lightStrength*(vSurface>6.5?.12:.5);
      }
      if (vReflection > .5) color *= reflections * (.34 + .12 * sin(vWorld.y * 2.7 + time));
      color = mix(color, haze, smoothstep(200.0, 1300.0, length(cameraPosition - vWorld)) * .35 * hazeAmount);
      vec3 weatherPoint=vWorld;
      if (vReflection > .5) weatherPoint.y=waterLevel*2.0-vWorld.y;
      gl_FragColor = vec4(applyAtmosphere(color, weatherPoint) * sceneTint, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const group = new Group(), frustum = new Frustum(), projection = new Matrix4(), bounds = new Box3(), world = new Matrix4(), instance = new Matrix4();
  let reflect = true;
  const batches = [false, true].map(mirrored => {
    const mesh = new InstancedMesh(shape, material, 3);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage); mesh.frustumCulled = false;
    if (mirrored) mesh.scale.y = -1;
    group.add(mesh); return mesh;
  });
  return {
    group,
    configure(next: LandscapeConfig) {
      reflect=next.water.reflectionEnabled && next.water.reflectionDetail==='full';
      [next.docks.color, next.docks.edgeColor, next.docks.edgeColor, next.docks.quayColor, '#b27e4a',next.docks.quayColor,'#647273','#11191b'].forEach((value, i) => palette[i].set(value));
      palette[0].multiplyScalar(1.25); palette[2].multiplyScalar(.8); palette[3].multiplyScalar(.65);
      material.uniforms.shoreLights.value = next.docks.lights;
      for (const mesh of batches) if (mesh.scale.y < 0) mesh.position.y = next.water.waterLevel * 2;
    },
    update(travel: number, camera: PerspectiveCamera) {
      group.position.x = -((travel % coastPeriod + coastPeriod) % coastPeriod); group.updateMatrixWorld(true); camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const mesh of batches) {
        if (mesh.scale.y < 0 && !reflect) {mesh.visible=false;continue;}
        mesh.count = 0;
        for (const copy of [-1, 0, 1]) {
          instance.makeTranslation(copy * coastPeriod, 0, 0); world.multiplyMatrices(mesh.matrixWorld, instance);
          if (frustum.intersectsBox(bounds.copy(mesh.geometry.boundingBox!).applyMatrix4(world))) mesh.setMatrixAt(mesh.count++, instance);
        }
        mesh.visible = mesh.count > 0;
        if (mesh.count) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const mesh of batches) mesh.dispose(); shape.dispose(); material.dispose(); group.clear(); }
  };
}
