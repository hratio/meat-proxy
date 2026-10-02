import * as T from 'three';
import { artwork } from './artwork';
import attachments from './attachments.json';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { expressionNames, type MockDaddyExpression } from './playback';

export type MockDaddyEffectsOptions = {
  smoke: number;
  fire: number;
  embers: number;
  /** Brightness multiplier, 0–20. Independent of spark emission. */
  glowIntensity: number;
  /** Diameter multiplier, .5–4; affects the ember and its soft halo. */
  glowSize: number;
  reflections: number;
  glare: number;
  sparkle: number;
  /** Sweeps per second, 0–2. Zero freezes automatic lens motion. */
  glareSpeed: number;
  wind: { x: number; y: number; z: number };
};


const noise = `
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
}
float fbm(vec2 p) { return .55*noise(p)+.28*noise(p*2.03)+.17*noise(p*4.07); }
`;
const vertexShader = `
attribute vec2 life;
varying vec2 vUv;
varying vec2 vLife;
void main() {
  vUv=uv; vLife=life;
  vec4 p=vec4(position,1.);
  #ifdef USE_INSTANCING
  p=instanceMatrix*p;
  #endif
  gl_Position=projectionMatrix*modelViewMatrix*p;
}`;

export const createMockDaddyEffects = ({ gltf, controller, environment, camera, scene }: {
  gltf: GLTF;
  controller: { readonly name: MockDaddyExpression };
  environment: T.Texture;
  camera: T.Camera;
  scene: T.Scene;
}) => {
  const options: MockDaddyEffectsOptions = {
    smoke: .65, fire: .3, embers: .75, glowIntensity: 3, glowSize: 1.3,
    reflections: .5, glare: .35, sparkle: .3, glareSpeed: .18,
    wind: { x: .08, y: 0, z: 0 },
  };
  const group = new T.Group();
  group.name = 'MockDaddy cigar effects';
  scene.add(group);
  const lensMaterial = new T.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: .12, clearcoat: 1,
    clearcoatRoughness: .08, transparent: true, opacity: .5,
    blending: T.AdditiveBlending, depthWrite: false, envMap: environment, envMapIntensity: 2.5,
  });
  // Share lens geometry; the additive sweep leaves environment reflections intact.
  const glareMaterial = new T.ShaderMaterial({
    uniforms: { phase: { value: 0 }, glare: { value: 0 }, sparkle: { value: 0 }, flash: { value: 0 } },
    transparent: true, depthWrite: false, depthTest: false,
    blending: T.AdditiveBlending, toneMapped: false,
    vertexShader: `
      attribute float rim;
      varying vec2 vUv;
      varying float vRim;
      void main() {
        vUv=uv; vRim=rim;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `
      uniform float phase, glare, sparkle, flash;
      varying vec2 vUv;
      varying float vRim;
      void main() {
        float edge=1.-smoothstep(.78,1.,vRim);
        float sweep=fract(phase)*2.4-.7;
        float d=vUv.x+.28*vUv.y-sweep;
        float stripe=exp(-d*d/ .008)+.18*exp(-d*d/ .055);
        vec2 center=vec2(.5+.24*sin(phase*6.283),.64+.12*cos(phase*6.283));
        vec2 p=vUv-center;
        float core=exp(-dot(p,p)/.0007);
        float rays=exp(-abs(p.x)*150.-abs(p.y)*18.)+exp(-abs(p.y)*150.-abs(p.x)*18.);
        float twinkle=pow(max(0.,sin(phase*6.283)),16.);
        float gleam=glare*stripe*.42+sparkle*(core+rays*.6)*(twinkle+flash)*1.5;
        gleam+=flash*glare*.25*exp(-d*d/.06);
        gl_FragColor=vec4(vec3(.68,.84,1.)*gleam,edge);
        #include <colorspace_fragment>
      }`,
  });
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
  const attach = (face: T.Mesh, x: number, y: number) => {
    const samples = attachments.samples as Record<string, Record<string, number[]>>;
    const data = samples[face.name]?.[`${x.toFixed(12)},${y.toFixed(12)}`];
    if (!data) throw new Error(`Missing baked surface attachment: ${face.name}`);
    const indices = data.slice(0, 3), bary = new T.Vector3(...data.slice(3) as [number, number, number]);
    return (out:T.Vector3) => {
      face.getVertexPosition(indices[0],a);
      face.getVertexPosition(indices[1],b);
      face.getVertexPosition(indices[2],c);
      return out.copy(a).multiplyScalar(bary.x).addScaledVector(b,bary.y).addScaledVector(c,bary.z);
    };
  };
  const surfaces = new Map(expressionNames.map(name => {
    const face=gltf.scene.getObjectByName(`MockDaddy_${name}_Face`) as T.Mesh;
    const data=artwork[name];
    const uv=(p:number[]) => name==='Idle' ? p : [p[0]/1536,p[1]/1024];
    const tip=uv(data.tip);
    const lenses=data.lenses.map(polygon => {
      const points=polygon.map(uv);
      const center=points.reduce((p,q)=>[p[0]+q[0]/points.length,p[1]+q[1]/points.length],[0,0]);
      const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
      const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
      const lensUv=(x:number,y:number)=>[(x-minX)/(maxX-minX),1-(y-minY)/(maxY-minY)];
      const coordinates=lensUv(center[0],center[1]),rim=[0];
      const samples=[{sample:attach(face,center[0],center[1]),bulge:.023}];
      const segments=points.length*4, rings=4;
      for(let ring=1;ring<=rings;ring++) for(let i=0;i<segments;i++) {
        const p=points[Math.floor(i/4)],q=points[(Math.floor(i/4)+1)%points.length],t=(i%4)/4,r=ring/rings;
        const x=T.MathUtils.lerp(center[0],T.MathUtils.lerp(p[0],q[0],t),r);
        const y=T.MathUtils.lerp(center[1],T.MathUtils.lerp(p[1],q[1],t),r);
        samples.push({sample:attach(face,x,y),bulge:.006+.017*(1-r*r)});
        coordinates.push(...lensUv(x,y));rim.push(r);
      }
      const indices:number[]=[];
      for(let i=0;i<segments;i++) indices.push(0,1+(i+1)%segments,1+i);
      for(let ring=1;ring<rings;ring++) for(let i=0;i<segments;i++) {
        const p=1+(ring-1)*segments+i,q=1+(ring-1)*segments+(i+1)%segments,r=p+segments,s=q+segments;
        indices.push(p,q,r,q,s,r);
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(samples.length*3),3));
      geometry.setAttribute('uv',new T.Float32BufferAttribute(coordinates,2));
      geometry.setAttribute('rim',new T.Float32BufferAttribute(rim,1));
      geometry.setIndex(indices);
      const mesh=new T.Mesh(geometry,lensMaterial);
      mesh.name=`${name} reflective lens`;
      mesh.frustumCulled=false;
      mesh.renderOrder=2;
      face.add(mesh);
      const glareMesh=new T.Mesh(geometry,glareMaterial);
      glareMesh.name=`${name} lens glare`;
      glareMesh.frustumCulled=false;
      glareMesh.renderOrder=3;
      face.add(glareMesh);
      return {mesh,glareMesh,samples};
    });
    return [name,{face,tip:attach(face,tip[0],tip[1]),lenses}];
  }));
  const shader = (fragmentShader:string, additive=false) => new T.ShaderMaterial({
    vertexShader, fragmentShader: `varying vec2 vUv; varying vec2 vLife; uniform float time; uniform float strength; ${noise}\n${fragmentShader}`,
    // This is a HUD overlay: the relief's raised cheek must not occlude the trail.
    uniforms:{time:{value:0},strength:{value:1}}, transparent:true, depthWrite:false, depthTest:false,
    blending:additive?T.AdditiveBlending:T.NormalBlending, toneMapped:false,
  });
  const smokeMaterial=shader(`void main() {
    vec2 p=vUv*2.-1.;
    float n=fbm(vUv*4.+vec2(vLife.y,time*.12));
    float edge=1.-smoothstep(.25,1.,length(p)+.28*(n-.5));
    float fade=smoothstep(0.,.12,vLife.x)*(1.-smoothstep(.4,1.,vLife.x));
    float alpha=edge*fade*(.055+.12*n)*strength;
    gl_FragColor=vec4(vec3(.39,.42,.46)+.08*n,alpha);
    #include <colorspace_fragment>
  }`);
  const glowMaterial=shader(`void main() {
    float r=length(vUv*2.-1.);
    float pulse=.8+.13*sin(time*11.)+.07*sin(time*23.);
    float alpha=exp(-r*r*4.)*(1.-smoothstep(.7,1.,r));
    vec3 color=mix(vec3(1.,.04,.002),vec3(1.,.68,.28),exp(-r*r*16.));
    // Put intensity in RGB, not alpha, so values above 1 keep getting brighter.
    gl_FragColor=vec4(color*strength*pulse,alpha);
    #include <colorspace_fragment>
  }`,true);
  const haloMaterial=shader(`void main() {
    float r=length(vUv*2.-1.);
    float falloff=exp(-r*r*5.)*(1.-smoothstep(.6,1.,r));
    float pulse=.85+.1*sin(time*11.)+.05*sin(time*23.);
    gl_FragColor=vec4(vec3(1.,.095,.005)*strength*pulse,falloff*.13);
    #include <colorspace_fragment>
  }`,true);
  const flameMaterial=shader(`void main() {
    float y=vUv.y;
    float bend=.14*sin(y*8.-time*6.)*y;
    float x=(vUv.x-.5-bend)*2.;
    float n=fbm(vec2(x*4.,y*6.-time*4.));
    float width=(1.-y)*(.36+.22*n);
    float body=1.-smoothstep(width*.2,width,abs(x));
    float alpha=body*smoothstep(0.,.12,y)*(1.-smoothstep(.55,1.,y+n*.13))*strength;
    gl_FragColor=vec4(mix(vec3(1.,.06,.001),vec3(1.,.65,.15),body*(1.-y)),alpha);
    #include <colorspace_fragment>
  }`,true);
  const sparksMaterial=shader(`void main() {
    float alpha=(1.-smoothstep(.0,.5,length(vUv-.5)))*(1.-vLife.x)*strength;
    gl_FragColor=vec4(1.,.27,.018,alpha);
    #include <colorspace_fragment>
  }`,true);
  const quad = () => {
    const geometry=new T.PlaneGeometry(1,1);
    geometry.setAttribute('life',new T.Float32BufferAttribute(new Float32Array(8),2));
    return geometry;
  };
  const glow=new T.Mesh(quad(),glowMaterial), flame=new T.Mesh(quad(),flameMaterial);
  const halo=new T.Mesh(quad(),haloMaterial);
  halo.name='MockDaddy ember halo';halo.renderOrder=3;
  group.add(glow,flame,halo);
  glow.renderOrder=4;flame.renderOrder=4;
  const pool = (count:number,material:T.ShaderMaterial) => {
    const geometry=quad();
    const life=new T.InstancedBufferAttribute(new Float32Array(count*2),2);
    geometry.setAttribute('life',life);
    const mesh=new T.InstancedMesh(geometry,material,count);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled=false;
    mesh.renderOrder=5;
    group.add(mesh);
    const particles=Array.from({length:count},()=>({position:new T.Vector3(),velocity:new T.Vector3(),age:100,life:1,seed:Math.random()*100,size:0}));
    return {mesh,life,particles,cursor:0,budget:0};
  };
  const smoke=pool(96,smokeMaterial),sparks=pool(24,sparksMaterial);
  const anchor=new T.Vector3(),point=new T.Vector3(),scale=new T.Vector3(),worldScale=new T.Vector3();
  const quaternion=new T.Quaternion(),matrix=new T.Matrix4();
  let time=0,puff=0,enabled=true,glarePhase=0,flash=0;
  const spawn = (p:typeof smoke,dt:number,rate:number,spark:boolean,size:number) => {
    p.budget+=dt*rate;
    while(p.budget>=1) {
      p.budget--;
      const item=p.particles[p.cursor++%p.particles.length];
      item.position.copy(anchor);
      item.position.y+=.025*size;
      item.velocity.set((Math.random()-.5)*.045,spark?.18+Math.random()*.28:.19+Math.random()*.08,(Math.random()-.5)*.02).multiplyScalar(size);
      item.age=0;item.life=spark?.45+Math.random()*.5:2.5+Math.random()*1.1;
      item.size=size;
    }
  };
  const updatePool = (p:typeof smoke,dt:number,spark:boolean) => {
    for(let i=0;i<p.particles.length;i++) {
      const item=p.particles[i];item.age+=dt;
      const age=item.age/item.life;
      let size=0;
      if(age<1) {
        item.position.addScaledVector(item.velocity,dt);
        item.position.x+=(options.wind.x+Math.sin(time*2.3+item.seed)*.11*age)*dt*item.size;
        item.position.y+=options.wind.y*dt*item.size;
        item.position.z+=options.wind.z*dt*item.size;
        size=(spark?.017*(1-age*.5):.075+age*.42)*item.size;
      }
      scale.set(size,size,size);
      matrix.compose(item.position,quaternion,scale);
      p.mesh.setMatrixAt(i,matrix);
      p.life.setXY(i,Math.min(age,1),item.seed);
    }
    p.mesh.instanceMatrix.needsUpdate=true;p.life.needsUpdate=true;
  };
  const update = (delta:number) => {
    const dt=Math.min(Math.max(delta,0),.1);
    time+=dt;puff=Math.max(0,puff-dt*.75);
    glarePhase+=dt*options.glareSpeed;flash=Math.max(0,flash-dt*1.8);
    glareMaterial.uniforms.phase.value=glarePhase;
    glareMaterial.uniforms.glare.value=options.glare;
    glareMaterial.uniforms.sparkle.value=options.sparkle;
    glareMaterial.uniforms.flash.value=flash;
    gltf.scene.updateWorldMatrix(true,true);
    camera.getWorldQuaternion(quaternion);
    const surface=surfaces.get(controller.name)!;
    surface.tip(anchor);anchor.z+=.012;
    surface.face.localToWorld(anchor);
    surface.face.getWorldScale(worldScale);
    const size=Math.abs(worldScale.x);
    for(const lens of surface.lenses) {
      const pos=lens.mesh.geometry.attributes.position;
      lens.samples.forEach((sample,i)=>{sample.sample(point);point.z+=sample.bulge;pos.setXYZ(i,point.x,point.y,point.z);});
      pos.needsUpdate=true;lens.mesh.geometry.computeVertexNormals();
    }
    lensMaterial.opacity=enabled?options.reflections:0;
    group.visible=enabled;
    for(const item of surfaces.values())for(const lens of item.lenses){
      lens.mesh.visible=enabled&&options.reflections>0;
      lens.glareMesh.visible=enabled&&(options.glare>0||options.sparkle>0);
    }
    glow.visible=(options.embers>0||puff>0)&&options.glowIntensity>0;
    halo.visible=glow.visible;
    flame.visible=options.fire>0;
    glow.position.copy(anchor);glow.quaternion.copy(quaternion);glow.scale.setScalar(.17*size*options.glowSize);
    halo.position.copy(anchor);halo.quaternion.copy(quaternion);halo.scale.setScalar(.46*size*options.glowSize);
    flame.position.copy(anchor);flame.position.y+=(.07+options.fire*.06)*size;
    flame.quaternion.copy(quaternion);flame.scale.set(.2*size,(.16+options.fire*.15)*size,1);
    glowMaterial.uniforms.strength.value=enabled?(options.embers+puff*.5)*options.glowIntensity:0;
    haloMaterial.uniforms.strength.value=glowMaterial.uniforms.strength.value;
    flameMaterial.uniforms.strength.value=enabled?options.fire*(.7+puff*.4):0;
    smokeMaterial.uniforms.strength.value=1;
    for(const mat of [smokeMaterial,glowMaterial,haloMaterial,flameMaterial,sparksMaterial])mat.uniforms.time.value=time;
    if(enabled) {
      spawn(smoke,dt,options.smoke*(22+puff*26),false,size);
      spawn(sparks,dt,options.embers*(1+options.fire*4+puff*5),true,size);
    }
    updatePool(smoke,dt,false);updatePool(sparks,dt,true);
  };
  const clear = () => { for(const p of [smoke,sparks]){p.budget=0;for(const item of p.particles)item.age=100;} };
  update(0);
  return {
    update,
    set(values:Partial<MockDaddyEffectsOptions>) {
      for(const key of ['smoke','fire','embers','reflections','glare','sparkle'] as const)if(values[key]!==undefined)options[key]=T.MathUtils.clamp(values[key]!,0,1);
      if(values.glowIntensity!==undefined)options.glowIntensity=T.MathUtils.clamp(values.glowIntensity,0,20);
      if(values.glowSize!==undefined)options.glowSize=T.MathUtils.clamp(values.glowSize,.5,4);
      if(values.glareSpeed!==undefined)options.glareSpeed=T.MathUtils.clamp(values.glareSpeed,0,2);
      if(values.wind)options.wind={...values.wind};
    },
    setEnabled(value:boolean){enabled=value;if(!value)clear();update(0);},
    puff(strength=1){puff=T.MathUtils.clamp(strength,0,2);},
    flashGlasses(strength=1){flash=T.MathUtils.clamp(strength,0,2);glarePhase=Math.floor(glarePhase)+.25;},
    setEnvironment(texture:T.Texture|null){lensMaterial.envMap=texture??environment;lensMaterial.needsUpdate=true;},
    clear,
    get options(){return {...options,wind:{...options.wind}};},
    get anchor(){return anchor.clone();},
    get particleCount(){return smoke.particles.filter(p=>p.age<p.life).length;},
    dispose(){
      group.removeFromParent();
      for(const surface of surfaces.values())for(const lens of surface.lenses){lens.mesh.removeFromParent();lens.glareMesh.removeFromParent();lens.mesh.geometry.dispose();}
      for(const mesh of [smoke.mesh,sparks.mesh,glow,flame,halo])mesh.geometry.dispose();
      for(const mat of [smokeMaterial,sparksMaterial,glowMaterial,haloMaterial,flameMaterial,lensMaterial,glareMaterial])mat.dispose();
      environment.dispose();
    },
  };
};
