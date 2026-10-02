import type { LandscapeConfig } from './landscape-config';
import { createShoreProfile } from './shoreline-math';
export type RoutePoint = { x: number; y: number; z: number; heading: number; pitch: number };
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const profiles=new WeakMap<LandscapeConfig,ReturnType<typeof createShoreProfile>>();
function shore(world:LandscapeConfig){let profile=profiles.get(world);if(!profile){profile=createShoreProfile(world.seed,world.docks);profiles.set(world,profile);}return profile;}

export function routeStart(world:LandscapeConfig) {
  return world.sequence.travelMode==='cruise'?world.sequence.startX:world.camera.offset;
}

/** Absolute route distance; reduced motion (Infinity) samples the authored end. */
function scheduledTravel(timeMs:number,world:LandscapeConfig) {
  const sequence=world.sequence;
  const clock=Number.isFinite(timeMs)?Math.max(0,timeMs):sequence.durationMs;
  if(sequence.travelMode==='cruise'){
    const t=(sequence.continueDriving?clock:Math.min(clock,sequence.durationMs))/1000;
    return routeStart(world)+sequence.speedKph/3.6*t*(Math.sign(world.speed)||1);
  }
  const end=world.sequence.durationMs/1000,settle=Math.min(world.camera.settleSeconds,end*.25);
  const t=Math.min(end,clock/1000),glide=end-settle;
  const speed=world.camera.panDistance*(Math.sign(world.speed)||1)/(glide+settle/2),brake=Math.max(0,t-glide);
  return world.camera.offset+speed*(Math.min(t,glide)+brake-brake*brake/(2*settle));
}
/** Garage position and all of its cues share the title's absolute clock.
 * The metre trim shifts the arrival by the equivalent driving time. */
export function garageSchedule(world:LandscapeConfig) {
  const s=world.sequence,g=s.garage,dir=Math.sign(world.speed)||1;
  const speed=s.travelMode==='cruise'?s.speedKph/3.6:Math.max(.1,world.camera.panDistance/(s.durationMs/1000));
  const entryAtMs=Math.max(0,s.titleAtMs+g.entryOffsetMs+g.distanceOffset/speed*1000);
  const entryTravel=scheduledTravel(entryAtMs,world),distance=Math.max(0,dir*(entryTravel-routeStart(world)));
  return {entryAtMs,entryTravel,distance,speed,dir,openAtMs:entryAtMs+g.openOffsetMs,
    holdAtMs:entryAtMs+g.holdOffsetMs,fadeAtMs:entryAtMs+g.fadeOffsetMs};
}

/** Continue into the bay, then brake smoothly before its back wall. */
export function drivingTravel(timeMs:number,world:LandscapeConfig) {
  const s=world.sequence,t=Number.isFinite(timeMs)?Math.max(0,timeMs):s.durationMs;
  if(!s.garage.enabled)return scheduledTravel(t,world);
  const g=garageSchedule(world);
  if(t<=g.entryAtMs)return scheduledTravel(t,world);
  const stopDistance=s.garage.depth-7,duration=2*stopDistance/g.speed;
  const elapsed=Math.min(duration,(t-g.entryAtMs)/1000);
  return g.entryTravel+g.dir*g.speed*(elapsed-elapsed*elapsed/(2*duration));
}
export function garageFade(timeMs:number,world:LandscapeConfig){
  const g=world.sequence.garage;if(!world.sequence.enabled||!g.enabled||!g.fade)return 0;
  const clock=Number.isFinite(timeMs)?timeMs:world.sequence.durationMs;
  const t=clamp((clock-garageSchedule(world).fadeAtMs)/Math.max(1,g.fadeDurationMs));
  return t*t*(3-2*t);
}
export function garagePlacement(world:LandscapeConfig):RoutePoint {
  const g=garageSchedule(world),p=routeCenter(g.distance,world),s=world.sequence.garage;
  return {...p,x:p.x+Math.sin(p.heading)*s.lateralOffset,y:p.y+s.heightOffset,z:p.z+Math.cos(p.heading)*s.lateralOffset,pitch:0};
}

export function routeLayout(world:LandscapeConfig) {
  const sequence=world.sequence,dir=Math.sign(world.speed)||1;
  const start=routeStart(world),junction=Math.abs(scheduledTravel(sequence.junctionAtMs,world)-start);
  const radius=sequence.turnRadius,turn=radius*Math.PI/2;
  const roadZ=world.camera.distance-dir*sequence.roadWidth/4,base=world.camera.height-1.15;
  const landingX=start+dir*(junction+radius),cityZ=shore(world).coast(landingX)-85;
  return {start,dir,junction,radius,turn,roadZ,base,landingX,cityZ,span:turn+roadZ-radius-cityZ,cityHeight:shore(world).height(landingX,cityZ)+.12};
}

/** Keep land, street furniture and end fog centered on the coastal part of the route. */
export function routeDistrictCenter(world:LandscapeConfig) {
  if(!world.sequence.enabled||world.sequence.travelMode!=='cruise')return world.camera.offset+world.camera.panDistance*(Math.sign(world.speed)||1)*.5;
  const {start,dir,junction}=routeLayout(world);
  const length=world.sequence.bridge?junction:Math.abs(drivingTravel(world.sequence.durationMs,world)-start);
  return start+dir*length*.5;
}

/** A road reserved through every generated city row, including the far landing. */
export function cityStreetClearance(x:number,width:number,world:LandscapeConfig) {
  if(!world.sequence.enabled||!world.sequence.bridge)return false;
  return Math.abs(x-routeLayout(world).landingX)<width/2+world.sequence.roadWidth/2+world.sequence.shoulder+5;
}

/** Shared vertical alignment: climb before turning, crest over the channel,
 * then descend to the original far-bank height. Slopes are in metres/metre. */
export function bridgeGrade(distance:number,world:LandscapeConfig) {
  const {junction,turn,base,span,cityHeight}=routeLayout(world),s=world.sequence;
  if(!s.bridge)return {y:base,slope:0};
  const begin=Math.max(0,junction-s.bridgeApproach),crest=junction+Math.min(turn+90,span*.46);
  const end=junction+span,peak=Math.max(base+s.bridgeRise,cityHeight+4);
  const from=distance<crest?begin:crest,to=distance<crest?crest:end;
  const low=distance<crest?base:peak,high=distance<crest?peak:cityHeight;
  const t=clamp((distance-from)/Math.max(1,to-from));
  return {y:low+(high-low)*t*t*(3-2*t),slope:t>0&&t<1?(high-low)*6*t*(1-t)/(to-from):0};
}

/** Tangent circular turn into the bridge; horizontal layout is unchanged. */
export function routeCenter(distance:number,world:LandscapeConfig):RoutePoint {
  const {start,dir,junction,radius,turn,roadZ,base,landingX}=routeLayout(world);
  const grade=bridgeGrade(distance,world);
  if(!world.sequence.bridge||distance<=junction)return{x:start+dir*distance,y:grade.y,z:roadZ,heading:dir>0?0:Math.PI,pitch:Math.atan(grade.slope)};
  const d=distance-junction,angle=Math.min(Math.PI/2,d/radius),x=junction+radius*Math.sin(angle);
  const z=roadZ-radius*(1-Math.cos(angle))-Math.max(0,d-turn);
  return{x:d>turn?landingX:start+dir*x,y:grade.y,z,heading:dir>0?angle:Math.PI-angle,pitch:Math.atan(grade.slope)};
}

/** Grade the narrow approach corridor into the land, with a soft embankment.
 * Sharing the deck profile prevents hidden terrain from cutting across the road. */
export function cityStreetGround(x:number,z:number,ground:number,world:LandscapeConfig){
  if(!world.sequence.enabled||!world.sequence.bridge)return ground;
  const layout=routeLayout(world),half=world.sequence.roadWidth/2+world.sequence.shoulder;
  if(z>layout.roadZ-layout.radius)return ground;
  const blend=1-clamp((Math.abs(x-layout.landingX)-half)/12);
  if(!blend)return ground;
  const d=layout.junction+layout.turn+layout.roadZ-layout.radius-z;
  const y=routeCenter(d,world).y-.12;
  return ground+(y-ground)*blend*blend*(3-2*blend);
}
export function carRoute(travel:number,world:LandscapeConfig):RoutePoint {
  const point=routeCenter(Math.abs(travel-routeStart(world)),world),lane=world.sequence.roadWidth/4;
  return {...point,x:point.x+Math.sin(point.heading)*lane,z:point.z+Math.cos(point.heading)*lane};
}
export function routePoint(local:[number,number,number],route:RoutePoint):[number,number,number] {
  const [x,y,z]=local,c=Math.cos(route.heading),s=Math.sin(route.heading),cp=Math.cos(route.pitch),sp=Math.sin(route.pitch);
  return [route.x+x*c*cp-y*c*sp+z*s,route.y+x*sp+y*cp,route.z-x*s*cp+y*s*sp+z*c];
}
export function routeLocal(point:[number,number,number],route:RoutePoint):[number,number,number] {
  const x=point[0]-route.x,y=point[1]-route.y,z=point[2]-route.z,c=Math.cos(route.heading),s=Math.sin(route.heading),cp=Math.cos(route.pitch),sp=Math.sin(route.pitch);
  return [x*c*cp+y*sp-z*s*cp,-x*c*sp+y*cp+z*s*sp,x*s+z*c];
}

/** Near bank closes the waterway toward the foggy ends of the district. */
export function nearBankCoast(x:number,world:LandscapeConfig) {
  const {roadZ}=routeLayout(world),center=routeDistrictCenter(world);
  const end=clamp((Math.abs(x-center)-950)/650);
  return roadZ-world.sequence.roadWidth/2-world.sequence.shoulder-4-end*end*500;
}
export function nearBankHeight(x:number,z:number,world:LandscapeConfig){
  const layout=routeLayout(world),depth=z-nearBankCoast(x,world);
  const grade=bridgeGrade((x-layout.start)*layout.dir,world).y;
  const weight=1-clamp((depth-40)/120),base=layout.base+(grade-layout.base)*weight;
  return depth<0?base+depth*.4:depth<35?base-.08:base+Math.min(2.5,(depth-35)*.01);
}

/** Shared street grid keeps access lanes clear of procedural building footprints. */
export const bankStreetSpacing=156;
export function bankStreetDistance(x:number,world:LandscapeConfig){
  const center=routeDistrictCenter(world);
  return Math.abs(((x-center+bankStreetSpacing/2)%bankStreetSpacing+bankStreetSpacing)%bankStreetSpacing-bankStreetSpacing/2);
}
