import type { LandscapeConfig } from './landscape-config';
import { garageSchema, type CameraBeat, type DrivingSequence } from './sequence-config';
import type { Point, SequenceFrame } from './sequence-math';
import { drivingTravel, carRoute, routePoint, routeLocal, garageSchedule } from './driving-route';
export { drivingTravel } from './driving-route';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const blend = (a: Point, b: Point, p: number): Point => a.map((v, i) => mix(v, b[i], p)) as Point;
const length = (p: Point) => Math.hypot(...p);
const unit = (p: Point): Point => p.map(v => v / Math.max(.0001, length(p))) as Point;


/** Change coordinate systems without moving the arrival pose. */
export function cameraSpace(beat: CameraBeat, space: CameraBeat['space'], world: LandscapeConfig): CameraBeat {
  if (beat.space === space) return beat;
  const route = carRoute(drivingTravel(beat.atMs, world),world);
  const position = space === 'world' ? routePoint(beat.position,route) : routeLocal(beat.position,route);
  return { ...beat, space, position };
}

function pose(beat: CameraBeat, world: LandscapeConfig, travel: number) {
  const route = carRoute(travel,world);
  const carPoint = (point: Point): Point => routePoint(point,route);
  const camera = world.sequence.seatLocked ? carPoint(world.sequence.seatPosition)
    : beat.space === 'car' ? carPoint(beat.position) : [...beat.position] as Point;
  if (beat.target === 'car-direction') {
    const origin=carPoint([0,0,0]),aim=carPoint(unit(beat.lookAt));
    return {camera,target:camera.map((v,i)=>v+(aim[i]-origin[i])*100) as Point};
  }
  const prop = world.sequence.props.find(prop => prop.id === beat.target);
  let target: Point;
  if (prop) target = [prop.x, world.water.waterLevel + prop.height + prop.scale * .25, prop.z];
  else if (beat.target === 'driver') target = carPoint([-.12, 1.04, -.34]);
  else if (beat.target === 'corporate') target = [world.landmarks.gateX, 181.5 * world.landmarks.gateScale, -375];
  else if (beat.target === 'observatory') target = [world.landmarks.observatoryX, 159.5 * world.landmarks.observatoryScale, -420];
  else if (beat.target === 'point') return { camera, target: beat.lookAt };
  else target = [travel + Math.tan(world.camera.yaw * Math.PI / 180) * (world.camera.distance + 700), world.camera.targetHeight, -700];
  return { camera, target: target.map((v, i) => v + beat.lookAt[i]) as Point };
}

// Interpolate the viewing direction separately from subject distance. Blending
// metre-distant driver and kilometre-distant skyline targets directly would snap
// the camera away from the driver in the first fraction of the transition.
function direction(a: Point, b: Point, p: number): Point {
  const dot = Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0)));
  if (dot > .9995) return unit(blend(a, b, p));
  if (dot < -.9995) {
    const side = unit(Math.abs(a[1]) < .9 ? [-a[2], 0, a[0]] : [0, -a[2], a[1]]);
    return a.map((v, i) => v * Math.cos(Math.PI * p) + side[i] * Math.sin(Math.PI * p)) as Point;
  }
  const angle = Math.acos(dot), sine = Math.sin(angle);
  return a.map((v, i) => (v * Math.sin((1-p)*angle) + b[i] * Math.sin(p*angle)) / sine) as Point;
}

export function drivingFrame(seconds: number, world: LandscapeConfig, aspect: number): SequenceFrame {
  const sequence = world.sequence, beats = [...sequence.frames].sort((a, b) => a.atMs - b.atMs);
  const actualTime=Number.isFinite(seconds)?Math.max(0,seconds*1000):sequence.durationMs;
  const cameraTime=sequence.garage.enabled&&sequence.garage.holdCamera?Math.min(actualTime,garageSchedule(world).holdAtMs):actualTime;
  const time = Math.min(sequence.durationMs, cameraTime);
  const index = Math.max(0, beats.findLastIndex(beat => beat.atMs <= time));
  const a = beats[index], b = beats[Math.min(index + 1, beats.length - 1)];
  let p = a === b ? 0 : clamp((time - a.atMs) / (b.atMs - a.atMs));
  p = b.easing === 'cut' ? 0 : b.easing === 'smooth' ? p*p*(3-2*p) : p;
  const travel = drivingTravel(actualTime, world), cameraTravel=drivingTravel(cameraTime,world), pa = pose(a, world, cameraTravel), pb = pose(b, world, cameraTravel);
  const camera = blend(pa.camera, pb.camera, p);
  const da = pa.target.map((v, i) => v - pa.camera[i]) as Point, db = pb.target.map((v, i) => v - pb.camera[i]) as Point;
  const aim = direction(unit(da), unit(db), p), distance = Math.max(.1, mix(length(da), length(db), p));
  const target = a.target === b.target && a.target !== 'car-direction' ? blend(pa.target,pb.target,p) : camera.map((v, i) => v + aim[i] * distance) as Point;
  // Keep a useful horizontal view in narrow windows, without shifting the seat
  // or making the driver a screen-space overlay. Lens editing remains vertical FOV.
  const vertical = mix(a.fov, b.fov, p), framing = Math.max(1, Math.min(1.55, (16/9) / aspect));
  const fov = Math.min(110, Math.atan(Math.tan(vertical*Math.PI/360) * framing) * 360/Math.PI);
  const route=carRoute(cameraTravel,world);
  const up:Point=[-Math.cos(route.heading)*Math.sin(route.pitch),Math.cos(route.pitch),Math.sin(route.heading)*Math.sin(route.pitch)];
  return { shot: a.id, travel, anchor: drivingTravel(sequence.durationMs, world),
    ...(sequence.seatLocked || (a.space === 'car' && b.space === 'car') ? {up} : {}),
    camera: [camera[0] - travel, camera[1], camera[2]],
    target: [target[0] - travel, target[1], target[2]], fov, roll: mix(a.roll, b.roll, p) * Math.PI / 180 };
}

/** A starting edit, anchored to the user's current route and camera height. */
export function createDrivingSequence(world: LandscapeConfig): DrivingSequence {
  const durationMs=60000,dir=Math.sign(world.speed)||1,speedKph=100,junctionAtMs=38000,turnRadius=95;
  // Approach west of the corporation's actual 154 m wide authored foundation.
  const landingX=world.landmarks.gateX-77*world.landmarks.gateScale-32;
  const startX=landingX-dir*(speedKph/3.6*junctionAtMs/1000+turnRadius);
  const seatPosition:Point=[.10,1.09,-.56];
  const frame=(id:string,name:string,atMs:number,lookAt:Point,fov=68,target:CameraBeat['target']='car-direction'):CameraBeat=>
    ({id,name,atMs,position:[...seatPosition],target,fov,space:'car',lookAt,roll:0,easing:'smooth'});
  return {
    enabled: true, durationMs, titleAtMs: durationMs, cabin: true, road: true, roadWidth: 6, shoulder: 1.2, cabinLight: 0,
    travelMode:'cruise',startX,speedKph,continueDriving:true,seatLocked:true,seatPosition,
    cabinBlackout: true, driverVisible: false, panoramicRoof:false, glassTint: .22, glassReflection: .25,
    garage:garageSchema.parse({enabled:true}),
    bank: true, bankBuildings: 0, bridge: true, junctionAtMs, turnRadius, bridgeRise: 16, bridgeApproach:220, roadLights: 1, lampSpacing: 28,
    roadLightRadius: 11, roadLightColor: '#e6dcc7',
    props: [],
    frames: [
      frame('rear','Rearward · driver seat',0,[-.68,.10,-.73]),
      frame('rear-hold','Hold rearward view',6000,[-.68,.10,-.73]),
      frame('side','Side window · city',16000,[0,.12,-1]),
      frame('side-hold','Hold city · begin turn',36000,[0,.12,-1]),
      frame('windshield','Windshield · bridge',43000,[1,.035,0],72),
      frame('garage-approach','Garage approach',56000,[1,.015,0],72),
      frame('garage-hold','Garage arrival',60000,[1,.015,0],72)
    ]
  };
}
