import { Color, DataTexture, FloatType, RGBAFormat, Vector2, type Vector3 } from 'three';
import type { DrivingSequence } from './sequence-config';

/** A world-space lookup of actual lamps, rebuilt only with the road layout.
 * Four local lamps per surface cell costs the same number of light evaluations
 * at the end of the bridge as it does next to the car. No extra draw passes. */
export function roadLampGrid(lamps: readonly Vector3[], cellSize = 16) {
  const padding=32;
  const minX=lamps.length?Math.floor((Math.min(...lamps.map(p=>p.x))-padding)/cellSize)*cellSize:0;
  const minZ=lamps.length?Math.floor((Math.min(...lamps.map(p=>p.z))-padding)/cellSize)*cellSize:0;
  const width=lamps.length?Math.ceil((Math.max(...lamps.map(p=>p.x))+padding-minX)/cellSize):1;
  const height=lamps.length?Math.ceil((Math.max(...lamps.map(p=>p.z))+padding-minZ)/cellSize):1;
  const data=new Float32Array(width*height*4*4);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const px=minX+(x+.5)*cellSize,pz=minZ+(z+.5)*cellSize;
    const nearest=lamps.map(point=>({point,distance:(point.x-px)**2+(point.z-pz)**2})).sort((a,b)=>a.distance-b.distance).slice(0,4);
    for(let i=0;i<4;i++){
      const point=nearest[i]?.point,index=((z*width+x)*4+i)*4;
      if(point)data.set([point.x,point.y,point.z,1],index);
    }
  }
  return {data,width,height,minX,minZ,cellSize};
}

export function createRoadLighting() {
  let texture=new DataTexture(new Float32Array(16),4,1,RGBAFormat,FloatType);texture.needsUpdate=true;
  const uniforms={
    roadLampGrid:{value:texture},roadLampOrigin:{value:new Vector2()},roadLampSize:{value:new Vector2(1,1)},roadLampCell:{value:16},
    roadLighting:{value:1},roadLightRadius:{value:11},roadLightColor:{value:new Color('#e6dcc7')}
  };
  return {uniforms,
    rebuild(lamps:readonly Vector3[]){
      const grid=roadLampGrid(lamps);texture.dispose();
      texture=new DataTexture(grid.data,grid.width*4,grid.height,RGBAFormat,FloatType);texture.needsUpdate=true;
      uniforms.roadLampGrid.value=texture;uniforms.roadLampOrigin.value.set(grid.minX,grid.minZ);
      uniforms.roadLampSize.value.set(grid.width,grid.height);uniforms.roadLampCell.value=grid.cellSize;
    },
    configure(sequence:DrivingSequence){
      uniforms.roadLighting.value=sequence.road?sequence.roadLights:0;
      uniforms.roadLightRadius.value=sequence.roadLightRadius;uniforms.roadLightColor.value.set(sequence.roadLightColor);
    },
    dispose(){texture.dispose();}
  };
}

export const roadLightingShader=`
  uniform sampler2D roadLampGrid;
  uniform vec2 roadLampOrigin, roadLampSize;
  uniform float roadLampCell, roadLighting, roadLightRadius;
  uniform vec3 roadLightColor;
  vec3 roadLampLight(vec3 point, vec3 normal, vec3 eye, vec3 base, float wetness) {
    if(roadLighting<=0.0) return vec3(0.0);
    vec3 world=point+vec3(airTravel,0.0,0.0);
    vec2 cell=floor((world.xz-roadLampOrigin)/roadLampCell);
    if(any(lessThan(cell,vec2(0.0)))||any(greaterThanEqual(cell,roadLampSize))) return vec3(0.0);
    vec3 result=vec3(0.0);
    for(int i=0;i<4;i++){
      vec2 uv=(cell*vec2(4.0,1.0)+vec2(float(i)+.5,.5))/(roadLampSize*vec2(4.0,1.0));
      vec4 lamp=texture2D(roadLampGrid,uv);
      vec3 delta=lamp.xyz-world;
      float distance2=dot(delta,delta);
      vec3 light=delta*inversesqrt(max(.01,distance2));
      // Full-cutoff luminaire. Radius is its footprint at the 7 m mounting height.
      float cone=1.0-smoothstep(.55*roadLightRadius,roadLightRadius,length(delta.xz)*7.05/max(.01,delta.y));
      float reach=1.0-smoothstep(roadLightRadius,roadLightRadius+5.0,length(delta.xz));
      float attenuation=lamp.w*cone*reach*step(.05,delta.y)*49.7/max(2.0,distance2);
      float diffuse=max(0.0,dot(normal,light));
      float specular=pow(max(0.0,dot(normal,normalize(light+eye))),55.0)*wetness;
      result+=roadLightColor*roadLighting*attenuation*(base*diffuse*.85+specular*.1);
    }
    return result;
  }
`;
