import { Color, DoubleSide, Group, Mesh, ShaderMaterial, type MeshStandardMaterial, type Texture } from 'three';
import type { LandscapeConfig } from './landscape-config';
import { carRoute, routeLayout, routePoint } from './driving-route';
import { createDrivingEnvironment } from './driving-environment';
import { createDrivingGarage } from './driving-garage';
import { environmentLighting } from './environment-lighting';
import { lightningLighting } from './lightning';
import { atmosphereShader } from './atmosphere';
import { createRoadLighting, roadLightingShader } from './road-lighting';

/** Authored cabin plus the procedural riverbank, coastal road and bridge. */
export function createDrivingSet(shared: ShaderMaterial['uniforms']) {
  const group = new Group(), cabin = new Group();
  group.name = 'Driving set'; cabin.name = 'Passenger cabin'; group.add(cabin);
  const materials: ShaderMaterial[] = [];
  const drivers: Mesh[] = [];
  const roadLighting=createRoadLighting();
  const uniforms = { ...shared, ...roadLighting.uniforms, cabinFill: { value: 0 }, cabinBlackout: {value:1}, glassTint:{value:.7}, glassReflection:{value:.35}, dashboard: { value: [0,0,0] }, roadTravel: { value: 0 }, roadZ: { value: 0 }, roadHalfWidth: { value: 3 },
    roadJunctionMin:{value:0},roadJunctionMax:{value:0} };
  function surface(base = new Color('#25292a'), map: Texture | null = null, isRoad = false, portrait = false, emission=0, cabinSurface=false) {
    const material = new ShaderMaterial({
      uniforms: { ...uniforms, baseColor: { value: base }, colorMap: { value: map }, hasMap: { value: !!map }, isRoad: { value: isRoad }, portrait: { value: portrait },emission:{value:emission},cabinSurface:{value:cabinSurface} },
      side: DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying float vReflection;
        void main() { vUv=uv;
          vec4 p=vec4(position,1.0); vec3 n=normal;
          #ifdef USE_INSTANCING
            p=instanceMatrix*p; n=mat3(instanceMatrix)*n;
          #endif
          vWorld=(modelMatrix*p).xyz; vNormal=normalize(mat3(modelMatrix)*n);
          // A mirrored transform changes handedness. A rotated cabin surface
          // can have a negative Y basis without being a water reflection.
          vReflection=step(dot(cross(modelMatrix[0].xyz,modelMatrix[1].xyz),modelMatrix[2].xyz),0.0);
          gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
        }`,
      fragmentShader: lightningLighting + atmosphereShader + roadLightingShader + `
        uniform vec3 baseColor, sceneTint, lightDirection, skyTop, horizonColor, waterNear, moonDirection;
        uniform float lightStrength, moonBrightness, cabinFill, cabinBlackout, roadTravel, roadZ, roadHalfWidth;
        uniform float emission, roadJunctionMin, roadJunctionMax;
        uniform vec3 dashboard; uniform sampler2D colorMap; uniform bool hasMap, isRoad, portrait, cabinSurface;
        uniform float waterLevel, reflections;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal; varying float vReflection;
        ${environmentLighting}
        void main() {
          vec4 texel=hasMap?texture2D(colorMap,vUv):vec4(1.0);
          if(texel.a<.3) discard;
          if(vReflection>.5&&vWorld.y>waterLevel)discard;
          vec3 base=baseColor*texel.rgb, n=normalize(vNormal)*(gl_FrontFacing?1.0:-1.0);
          vec3 surfacePoint=vWorld;if(vReflection>.5){surfacePoint.y=waterLevel*2.0-vWorld.y;n.y=-n.y;}
          if(portrait) base=mix(vec3(dot(base,vec3(.2126,.7152,.0722))),base,.38)*vec3(.88,.96,1.0);
          vec2 ground=vec2(vWorld.x+roadTravel,vWorld.z);
          if(n.y>.6){
            float grain=fract(sin(dot(floor(ground*95.0),vec2(12.9898,78.233)))*43758.5453);
            float joint=min(abs(fract(ground.x/6.0)-.5),abs(fract(ground.y/6.0)-.5));
            base*=.88+.16*grain;
            if(!isRoad&&!hasMap)base*=.86+.14*smoothstep(.002,.008,joint);
          }
          if(isRoad && n.y>.6) {
            float x=vUv.x, lane=abs(vUv.y);
            float line=(1.0-smoothstep(.045,.075,lane))*step(3.0,mod(x,8.0));
            line=max(line,(1.0-smoothstep(.04,.08,abs(lane-roadHalfWidth+.25)))*.55);
            float worldX=vWorld.x+roadTravel;
            if(abs(vWorld.z-roadZ)<roadHalfWidth+.1 && worldX>roadJunctionMin && worldX<roadJunctionMax)line=0.0;
            base=mix(base,vec3(.23,.24,.22),line);
          }
          vec3 eye=normalize(cameraPosition-vWorld);
          float fill=pow(max(0.0,1.0-length(surfacePoint-dashboard)/2.2),2.0)*cabinFill;
          vec3 color=base*(environmentLight(n)*1.4+vec3(.3,.34,.36)*fill);
          color+=roadLampLight(surfacePoint,n,eye,base,isRoad?1.0:.18);
          color+=base*emission;
          float sheen=pow(max(0.0,dot(n,normalize(eye+normalize(lightDirection)))),28.0);
          color+=mainLightColor()*sheen*.06;
          color+=(base+.025)*stormLight(vWorld,n)*1.5;
          if(cabinSurface)color*=1.0-cabinBlackout;
          color=applyAtmosphere(color,surfacePoint);
          if(vReflection>.5)color*=.34*reflections;
          gl_FragColor=vec4(color*sceneTint,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    materials.push(material); return material;
  }
  function glass(mirror: boolean, roof=false) {
    const material=new ShaderMaterial({
      uniforms:{...uniforms,isMirror:{value:mirror},isRoof:{value:roof},panoramicRoof:{value:false}},side:DoubleSide,transparent:!mirror&&!roof,depthWrite:mirror||roof,forceSinglePass:true,
      vertexShader:`varying vec3 vWorld,vNormal;
        void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;vNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`,
      fragmentShader:atmosphereShader+roadLightingShader+`
        uniform vec3 sceneTint,skyTop,horizonColor,cloudColor,moonColor,moonDirection;
        uniform float glassTint,glassReflection,moonBrightness;uniform bool isMirror,isRoof,panoramicRoof;
        varying vec3 vWorld,vNormal;
        void main(){
          if(isRoof&&!panoramicRoof){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}
          vec3 eye=normalize(cameraPosition-vWorld),n=normalize(vNormal)*(gl_FrontFacing?1.0:-1.0);
          vec3 reflected=reflect(-eye,n);
          float fresnel=.04+.96*pow(1.0-max(0.0,dot(n,eye)),5.0);
          float cover=ceilingCover(reflected);
          vec3 sky=mix(horizonColor,skyTop,smoothstep(0.0,.65,reflected.y));
          sky=mix(sky,cloudColor*.8+cloudIllumination(reflected,vWorld),cover);
          float moon=exp(-pow(length(reflected-moonDirection)/.085,2.0));
          sky+=moonColor*moonBrightness*moon*.08*(1.0-cover*.9);
          float amount=glassReflection*(isMirror?.8:.15+.85*fresnel);
          vec3 color=vec3(.002,.0024,.0026)+sky*amount;
          color+=roadLampLight(vWorld,n,eye,vec3(0.0),1.0)*amount;
          float alpha=isMirror?1.0:mix(glassTint,1.0,fresnel*.35);
          gl_FragColor=vec4(applyAtmosphere(color,vWorld)*sceneTint,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });materials.push(material);return material;
  }
  const windowMaterial=glass(false),mirrorMaterial=glass(true),roofMaterial=glass(false,true);
  const environment=createDrivingEnvironment(surface),garage=createDrivingGarage(surface);group.add(environment.group,garage.group);
  let settings: LandscapeConfig, source: Group | undefined;
  return {
    group,
    setCabin(asset: Group) {
      if (source === asset) return;
      source = asset; cabin.clear();drivers.length=0;
      const copy = asset.clone(true);
      copy.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if(!object.geometry.getAttribute('normal')) object.geometry.computeVertexNormals();
        if(['driver-face','driver-body'].includes(object.userData.role)){drivers.push(object);object.visible=settings?.sequence.driverVisible??false;}
        const convert = (original: MeshStandardMaterial) => {
          if(original.userData.role==='cabin-mirror')return mirrorMaterial;
          if(original.userData.role==='cabin-roof-glass')return roofMaterial;
          if(object.userData.role==='cabin-glass'||original.userData.role==='cabin-glass')return windowMaterial;
          return surface(original.color?.clone() ?? new Color('white'), original.map ?? null, false, object.userData.role==='driver-face',0,true);
        };
        object.material = Array.isArray(object.material) ? object.material.map(material => convert(material as MeshStandardMaterial)) : convert(object.material as MeshStandardMaterial);
      });
      cabin.add(copy);
    },
    configure(next: LandscapeConfig) {
      settings = next; const sequence = next.sequence;
      group.visible = !!sequence?.enabled;
      if (!sequence) return;
      cabin.visible = sequence.cabin;
      garage.configure(next);
      if(environment.configure(next))roadLighting.rebuild(environment.lamps);
      roadLighting.configure(sequence);
      const layout=routeLayout(next),junctionX=layout.start+layout.dir*layout.junction;
      uniforms.cabinFill.value = sequence.cabinLight;
      uniforms.cabinBlackout.value=sequence.cabinBlackout?1:0;
      uniforms.glassTint.value=sequence.glassTint;uniforms.glassReflection.value=sequence.glassReflection;
      roofMaterial.uniforms.panoramicRoof.value=sequence.panoramicRoof;
      // A closed roof must write depth and join the opaque pass; alpha=1 in
      // a transparent material alone still allows panes behind it to blend over it.
      if(roofMaterial.transparent!==sequence.panoramicRoof){
        roofMaterial.transparent=sequence.panoramicRoof;
        roofMaterial.depthWrite=!sequence.panoramicRoof;
        roofMaterial.needsUpdate=true;
      }
      for(const driver of drivers)driver.visible=sequence.driverVisible;
      uniforms.roadZ.value = layout.roadZ; uniforms.roadHalfWidth.value = sequence.roadWidth/2;
      uniforms.roadJunctionMin.value=sequence.bridge?Math.min(junctionX,junctionX+layout.dir*layout.radius)-10:0;
      uniforms.roadJunctionMax.value=sequence.bridge?Math.max(junctionX,junctionX+layout.dir*layout.radius)+10:0;
    },
    update(time: number, travel: number, _reduced: boolean) {
      if (!group.visible) return;
      uniforms.roadTravel.value = travel;
      // The seat and interior share exactly the same rigid route transform.
      const route=carRoute(travel,settings);cabin.position.set(route.x-travel,route.y,route.z);cabin.rotation.set(0,route.heading,route.pitch,'YXZ');
      const dashboard=routePoint([.5,.78,-.2],route);dashboard[0]-=travel;uniforms.dashboard.value=dashboard;
      environment.update(travel);garage.update(time,travel);
    },
    dispose() { garage.dispose();environment.dispose();roadLighting.dispose();for(const material of materials) material.dispose();group.clear(); }
  };
}
