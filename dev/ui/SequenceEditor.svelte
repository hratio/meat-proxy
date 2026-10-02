<script lang="ts">
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import SplashLandscape from '$lib/components/splash/SplashLandscape.svelte';
  import SplashScreen from '$lib/components/splash/Splash2Screen.svelte';
  import { createSplash2Audio } from '$lib/components/splash/splash2-audio';
  import SplashSubtitles from '$lib/components/splash/SplashSubtitles.svelte';
  import { defaultSplash2Config } from '$lib/components/splash/splash2-playback-config';
  import { landscapeSchema, type LandscapeConfig } from '$lib/components/splash/landscape-config';
  import { createDrivingSequence, cameraSpace } from '$lib/components/splash/driving-sequence';
  import { carRoute, routeLocal, garageSchedule } from '$lib/components/splash/driving-route';
  import { sequenceFrame } from '$lib/components/splash/sequence-math';
  import type { CameraBeat, DrivingSequence, GarageConfig } from '$lib/components/splash/sequence-config';
  import TimelineScrubber from './TimelineScrubber.svelte';

  let { settings, active = true, onchange, onundo, onredo, canUndo, canRedo }: {
    settings: LandscapeConfig; active?: boolean; onchange: (settings: LandscapeConfig, source?: string) => void;
    onundo: () => void; onredo: () => void; canUndo: boolean; canRedo: boolean;
  } = $props();
  let time = $state(0), paused = $state(true), ready = $state(false), sound = $state(false), title = $state(true), fade = $state(false);
  let aspect = $state('1.7777777778'), selected = $state('rear'), error = $state('');
  let draft = $state<LandscapeConfig>(), lane = $state<HTMLDivElement>();
  let drag = $state<{ kind: 'beat' | 'lightning' | 'title' | 'junction' | 'garage' | 'door' | 'hold'; id: string; x: number; at: number; width: number; total: number }>();
  let player: ReturnType<typeof createSplash2Audio> | undefined;
  let peaks = $state<number[]>([]), audioDuration = $state(0);
  let rate = $state(1), fast = $state(false), stats = $state({ calls: 0, triangles: 0 });
  let world = $derived(draft ?? settings), edit = $derived(world.sequence);
  let renderWorld = $derived(fast ? {...world,quality:{...world.quality,megapixels:Math.min(.75,world.quality.megapixels)},
    weather:{...world.weather,cloudSteps:2},water:{...world.water,reflectionDetail:'landmarks' as const}} : world);
  let beats = $derived([...edit.frames].sort((a,b) => a.atMs-b.atMs));
  let beat = $derived(beats.find(beat => beat.id === selected));
  let garage=$derived(garageSchedule(world));
  let total = $derived(Math.max(edit.durationMs+6000, edit.titleAtMs+6500,
    edit.garage.enabled?Math.max(garage.holdAtMs,garage.fadeAtMs+edit.garage.fadeDurationMs,garage.openAtMs+edit.garage.openDurationMs)+2000:0,
    ...world.lightning.cues.map(cue => cue.timeMs+world.lightning.duration*1050)));
  let tickStep = $derived(Math.max(1000, Math.ceil(total/10000)*1000));
  let ticks = $derived(Array.from({length:Math.floor(total/tickStep)+1},(_,i)=>i*tickStep));
  let current = $derived(sequenceFrame(time/1000,world,Number(aspect)));
  const targets = ['car-direction','corporate','observatory','city','point'] as const;
  const targetNames:Record<CameraBeat['target'],string>={'car-direction':'Direction inside car',corporate:'SLOP CORP',observatory:'Observatory',city:'City skyline',point:'World point',driver:'Driver',monitor:'Featured monitor',chair:'Featured chair'};
  let aimYaw=$derived(beat?Math.atan2(-beat.lookAt[2],beat.lookAt[0])*180/Math.PI:0);
  let aimPitch=$derived(beat?Math.atan2(beat.lookAt[1],Math.hypot(beat.lookAt[0],beat.lookAt[2]))*180/Math.PI:0);
  function aim(yaw:number,pitch:number){const y=yaw*Math.PI/180,p=pitch*Math.PI/180;changeBeat({target:'car-direction',lookAt:[Math.cos(y)*Math.cos(p),Math.sin(p),-Math.sin(y)*Math.cos(p)]});}
  const garageFields:{key:keyof GarageConfig;label:string;min:number;max:number;step:number}[]=[
    {key:'entryOffsetMs',label:'Arrival relative to title (ms)',min:-300000,max:300000,step:100},
    {key:'distanceOffset',label:'Along-road trim (m)',min:-500,max:500,step:1},
    {key:'lateralOffset',label:'Across-road offset (m)',min:-30,max:30,step:.1},
    {key:'heightOffset',label:'Garage height offset (m)',min:-10,max:20,step:.1},
    {key:'width',label:'Garage width (m)',min:5,max:40,step:.5},
    {key:'height',label:'Garage clearance (m)',min:3,max:12,step:.25},
    {key:'depth',label:'Garage depth (m)',min:25,max:200,step:5},
    {key:'openOffsetMs',label:'Door starts relative to arrival (ms)',min:-30000,max:30000,step:100},
    {key:'openDurationMs',label:'Door opening duration (ms)',min:200,max:20000,step:100},
    {key:'holdOffsetMs',label:'Camera holds after arrival (ms)',min:0,max:10000,step:100},
    {key:'fadeOffsetMs',label:'Fade starts after arrival (ms)',min:0,max:10000,step:100},
    {key:'fadeDurationMs',label:'Garage fade duration (ms)',min:0,max:10000,step:100}
  ];
  function changeGarage(patch:Partial<GarageConfig>){sequence({garage:{...edit.garage,...patch}});}
  const percentage = (ms: number) => Math.max(0,ms)/total*100;
  function seek(ms: number) { paused=true; time=Math.max(0,Math.min(total,Math.round(ms))); }
  function commit(next: LandscapeConfig, source='sequence') {
    const result=landscapeSchema.safeParse(next);
    if (!result.success) { error=result.error.issues[0].message; return; }
    error=''; onchange(result.data,source);
  }
  function sequence(patch: Partial<DrivingSequence>) { commit({...settings,sequence:{...settings.sequence,...patch}}); }
  function changeBeat(patch: Partial<CameraBeat>) {
    if(!beat)return;
    sequence({frames:settings.sequence.frames.map(item=>item.id===beat!.id?{...item,...patch}:item),
      durationMs:Math.max(settings.sequence.durationMs,patch.atMs??0)});
  }
  function number(event: Event, apply: (value:number)=>void) {
    const input=event.currentTarget as HTMLInputElement, value=input.valueAsNumber;
    if(Number.isFinite(value))apply(value);
  }
  function select(id: string) { selected=id; const beat=edit.frames.find(beat=>beat.id===id); if(beat)seek(beat.atMs); }
  function preset() {
    commit({...settings,sequence:createDrivingSequence(settings)},'');
    selected='rear'; seek(0);
  }
  function retime(durationMs: number) {
    const ratio=durationMs/edit.durationMs;
    sequence({durationMs,junctionAtMs:Math.round(edit.junctionAtMs*ratio),frames:edit.frames.map(beat=>({...beat,atMs:Math.round(beat.atMs*ratio)})),
      titleAtMs:Math.round(edit.titleAtMs*ratio)});
  }
  function addBeat() {
    let atMs=Math.min(edit.durationMs,Math.round(time));
    while(edit.frames.some(beat=>beat.atMs===atMs))atMs++;
    const id=crypto.randomUUID();
    const captured:CameraBeat={id,name:'New camera beat',atMs,space:'car',
      position:routeLocal([current.camera[0]+current.travel,current.camera[1],current.camera[2]],carRoute(current.travel,world)),
      target:'point',lookAt:[current.target[0]+current.travel,current.target[1],current.target[2]],
      fov:sequenceFrame(time/1000,world,16/9).fov,roll:current.roll*180/Math.PI,easing:'smooth'};
    if(edit.seatLocked){
      const localAim=routeLocal(captured.lookAt,carRoute(current.travel,world));
      const direction=localAim.map((v,i)=>v-edit.seatPosition[i]),length=Math.hypot(...direction);
      captured.position=[...edit.seatPosition];captured.target='car-direction';captured.lookAt=direction.map(v=>v/length) as CameraBeat['lookAt'];
    }
    sequence({frames:[...edit.frames,captured],durationMs:Math.max(edit.durationMs,atMs)}); selected=id;
  }
  function begin(event: PointerEvent, kind: 'beat'|'lightning'|'title'|'junction'|'garage'|'door'|'hold', id: string, at: number) {
    if(event.button!==0 || !lane)return;
    event.preventDefault(); paused=true;
    if(kind==='beat'){selected=id;time=at; if(at===0)return;}
    drag={kind,id,x:event.clientX,at,width:lane.getBoundingClientRect().width,total}; draft=structuredClone($state.snapshot(settings));
  }
  function move(event: PointerEvent) {
    if(!drag || !draft)return;
    let at=Math.round(Math.max(0,Math.min(drag.total,(drag.at+(event.clientX-drag.x)/drag.width*drag.total)))/ (event.shiftKey?1:100))*(event.shiftKey?1:100);
    if(drag.kind==='beat') {
      at=Math.max(1,Math.min(edit.durationMs,at));
      if(draft.sequence.frames.some(beat=>beat.id!==drag!.id&&beat.atMs===at))return;
      draft.sequence.frames=draft.sequence.frames.map(beat=>beat.id===drag!.id?{...beat,atMs:at}:beat);
      time=at;
    } else if(drag.kind==='title') draft.sequence.titleAtMs=at;
    else if(drag.kind==='junction') draft.sequence.junctionAtMs=Math.min(draft.sequence.durationMs,at);
    else if(drag.kind==='garage') draft.sequence.garage.entryOffsetMs=Math.round(at-draft.sequence.titleAtMs-draft.sequence.garage.distanceOffset/garage.speed*1000);
    else if(drag.kind==='door') draft.sequence.garage.openOffsetMs=Math.round(at-garage.entryAtMs);
    else if(drag.kind==='hold') draft.sequence.garage.holdOffsetMs=Math.max(0,Math.round(at-garage.entryAtMs));
    else {
      if(draft.lightning.cues.some((cue,i)=>String(i)!==drag!.id&&cue.timeMs===at))return;
      draft.lightning.cues=draft.lightning.cues.map((cue,i)=>String(i)===drag!.id?{...cue,timeMs:at}:cue);
    }
  }
  function finish() { if(draft)commit($state.snapshot(draft),''); drag=undefined; draft=undefined; }
  function nudge(event: KeyboardEvent, item:CameraBeat) {
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||item.atMs===0)return;
    event.preventDefault();selected=item.id;
    const atMs=Math.max(1,item.atMs+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1000:100));
    sequence({frames:edit.frames.map(beat=>beat.id===item.id?{...beat,atMs}:beat),durationMs:Math.max(edit.durationMs,atMs)});
    seek(atMs);
  }
  function addLightning() {
    let timeMs=Math.round(time);while(world.lightning.cues.some(cue=>cue.timeMs===timeMs))timeMs++;
    commit({...settings,lightning:{...settings.lightning,timing:settings.lightning.timing==='automatic'?'combined':settings.lightning.timing,
      cues:[...settings.lightning.cues,{timeMs,style:'forked',x:0,distance:40,height:120,branches:1,intensity:1}]}},'');
  }
  $effect(()=>{if(!active)paused=true;});
  onMount(()=>{
    let canceled=false, request=0, previous=0;
    const visibility=()=>{previous=0;};
    document.addEventListener('visibilitychange',visibility);
    player=createSplash2Audio();
    void player.prepare(defaultSplash2Config.audio,true).then(result=>{if(!canceled){audioDuration=result.duration;peaks=player!.waveform(180);}});
    const tick=(now:number)=>{
      const delta=previous?Math.max(0,now-previous):0;previous=now;
      if(active&&ready&&!paused&&!document.hidden&&!prefersReducedMotion.current){time=Math.min(total,time+delta*rate);if(time>=total)paused=true;}
      player?.sync(time,active&&ready&&!paused&&sound&&rate===1&&!document.hidden,.35);
      request=requestAnimationFrame(tick);
    };request=requestAnimationFrame(tick);
    return()=>{canceled=true;cancelAnimationFrame(request);document.removeEventListener('visibilitychange',visibility);player?.dispose();player=undefined;};
  });
</script>

<svelte:window onpointermove={move} onpointerup={finish} onpointercancel={()=>{drag=undefined;draft=undefined;}} onkeydown={event=>{if(event.key==='Escape'){drag=undefined;draft=undefined;}}}/>

<div class="sequence-editor">
  <div class="sequence-heading">
    <div><h2>Driving sequence</h2><p>Camera beats are arrival poses. Drag a beat to change when the camera reaches it. Shift-drag for 1 ms precision.</p></div>
    <div class="buttons"><Button variant="outline" onclick={preset}>Use 60-second driving edit</Button><Button variant="ghost" disabled={!canUndo} onclick={onundo}>Undo</Button><Button variant="ghost" disabled={!canRedo} onclick={onredo}>Redo</Button></div>
  </div>
  <div class="sequence-layout">
    <section aria-label="Sequence preview" class="min-w-0">
      <div class="preview-surround">
        <div class="shot-screen" style:aspect-ratio={aspect} style:width={`min(100%, calc(62dvh * ${aspect}))`} data-sequence-stage>
          {#if active}{#key edit.enabled}
            <SplashLandscape settings={renderWorld} time={time} {paused} preview={!fade} reducedMotion={prefersReducedMotion.current}
              onstatus={status=>ready=status==='ready'} onstats={value=>stats=value}/>
          {/key}{/if}
          {#if title && edit.enabled}<SplashScreen config={{openingDelay:edit.titleAtMs}} landscape={false} externalClock time={time} {paused}/>{/if}

          <SplashSubtitles {time} settings={defaultSplash2Config.subtitles} audio={defaultSplash2Config.audio} />
          <span class="shot-label">{ready?beats.find(beat=>beat.id===current.shot)?.name??'Waterfront':'Loading set…'}</span>
        </div>
      </div>
      <div class="transport">
        <Button variant="outline" aria-label="Sequence previous frame" onclick={()=>seek(time-1000/world.quality.fps)}>−1 frame</Button>
        <Button aria-label={paused?'Play sequence':'Pause sequence'} disabled={!ready||prefersReducedMotion.current} onclick={()=>{if(time>=total)time=0;paused=!paused;}}>{paused?'Play':'Pause'}</Button>
        <Button variant="outline" aria-label="Sequence next frame" onclick={()=>seek(time+1000/world.quality.fps)}>+1 frame</Button>
        <Input aria-label="Sequence playhead (ms)" type="number" min="0" step="1" class="h-8 w-28 font-mono text-xs" value={Math.round(time)} onfocus={()=>paused=true} onchange={event=>number(event,seek)}/><span>ms</span>
        <Button variant="ghost" onclick={()=>seek(0)}>Start</Button>
        <select aria-label="Sequence playback rate" bind:value={rate}><option value={.5}>½ speed</option><option value={1}>1×</option><option value={2}>2×</option></select>
        <select aria-label="Sequence aspect ratio" bind:value={aspect}><option value="1.7777777778">16:9</option><option value="2.3333333333">21:9</option><option value="1.3333333333">4:3</option><option value="0.5625">9:16</option></select>
      </div>
      <div class="preview-options"><label><input type="checkbox" bind:checked={sound}/> Audio</label><label><input type="checkbox" bind:checked={title}/> Title</label><label><input type="checkbox" bind:checked={fade}/> Opening fade</label><label title="Preview only: 0.75 megapixels, two cloud steps and landmark reflections"><input type="checkbox" bind:checked={fast}/> Fast preview</label><span>{stats.calls} draws · {Math.round(stats.triangles/1000)}k triangles</span></div>
      <TimelineScrubber label="Sequence playhead" max={total} value={Math.round(time)} onseek={seek}/>
      <div class="timeline" bind:this={lane}>
        <div class="ruler" aria-hidden="true">{#each ticks as ms}<span style:left={`${percentage(ms)}%`}>{(ms/1000).toFixed(0)}s</span>{/each}</div>
        <div class="track camera-track" aria-label="Camera beats">
          {#each beats as item,i (item.id)}
            <button class="camera-beat" class:selected={selected===item.id} style:left={`${percentage(item.atMs)}%`} style:width={`${Math.max(.8,percentage((beats[i+1]?.atMs??total)-item.atMs))}%`}
              aria-label={`Camera beat: ${item.name}`} title={`${item.name} · ${item.atMs} ms`} onpointerdown={event=>begin(event,'beat',item.id,item.atMs)} onclick={()=>select(item.id)} onkeydown={event=>nudge(event,item)}>
              <span class="beat-diamond">◆</span><span>{item.name}</span>
            </button>
          {/each}
          {#if !beats.length}<span class="empty-track">Choose the driving edit to start arranging camera beats</span>{/if}
        </div>
        <div class="track events-track" aria-label="Sequence events">
          <span class="track-caption">EVENTS</span>
          {#each world.lightning.cues as cue,i}<button class="event lightning" style:left={`${percentage(cue.timeMs)}%`} aria-label={`Timeline lightning ${i+1}`} title={`Lightning ${cue.timeMs} ms`} onpointerdown={event=>begin(event,'lightning',String(i),cue.timeMs)} onclick={()=>seek(cue.timeMs)}>ϟ</button>{/each}
          <button class="event title-cue" style:left={`${percentage(edit.titleAtMs)}%`} aria-label="Title entrance marker" onpointerdown={event=>begin(event,'title','title',edit.titleAtMs)} onclick={()=>seek(edit.titleAtMs)}>TITLE</button>
          {#if edit.bridge}<button class="event" style:left={`${percentage(edit.junctionAtMs)}%`} aria-label="Bridge junction marker" onpointerdown={event=>begin(event,'junction','junction',edit.junctionAtMs)} onclick={()=>seek(edit.junctionAtMs)}>BRIDGE</button>{/if}
          {#if edit.garage.enabled}
            <button class="event garage-cue" style:left={`${percentage(garage.openAtMs)}%`} aria-label="Garage door marker" title="Door opening starts" onpointerdown={event=>begin(event,'door','door',garage.openAtMs)} onclick={()=>seek(garage.openAtMs)}>DOOR</button>
            <button class="event garage-cue" style:left={`${percentage(garage.entryAtMs)}%`} aria-label="Garage arrival marker" title="Enter garage" onpointerdown={event=>begin(event,'garage','garage',garage.entryAtMs)} onclick={()=>seek(garage.entryAtMs)}>GARAGE</button>
            {#if edit.garage.holdCamera}<button class="event hold-cue" style:left={`${percentage(garage.holdAtMs)}%`} aria-label="Garage camera hold marker" title="Camera stops following the car" onpointerdown={event=>begin(event,'hold','hold',garage.holdAtMs)} onclick={()=>seek(garage.holdAtMs)}>HOLD</button>{/if}
          {/if}
        </div>
        <div class="track audio-track" aria-label="Opening audio waveform">
          <span class="track-caption">AUDIO {audioDuration?(audioDuration/1000).toFixed(1)+'s':''}</span>
          <svg viewBox="0 0 180 40" preserveAspectRatio="none" style:left={`${percentage(defaultSplash2Config.audio.at)}%`} style:width={`${percentage(Math.max(0,audioDuration-defaultSplash2Config.audio.offset))}%`} aria-hidden="true">
            {#each peaks as peak,i}<line x1={i+.5} x2={i+.5} y1={20-peak*17} y2={20+peak*17}/>{/each}
          </svg>
        </div>
        <div class="playhead" style:left={`${percentage(time)}%`} aria-hidden="true"></div>
      </div>
      <div class="buttons mt-3"><Button variant="outline" disabled={!edit.enabled||edit.frames.length>=64} onclick={addBeat}>Add camera beat here</Button><Button variant="outline" onclick={addLightning}>Add lightning here</Button><a href="/__dev/splash">Edit title and audio →</a></div>
      <p class="help">Camera motion, water, weather and lightning share this playhead. Audio plays at normal speed. Edit each lightning strike’s shape and position in Landscape → Lightning.</p>
    </section>
    <aside aria-label="Sequence inspector">
      <h3>Sequence</h3>
      <label class="toggle"><input type="checkbox" aria-label="Driving sequence enabled" checked={edit.enabled} onchange={event=>edit.frames.length?sequence({enabled:event.currentTarget.checked}):preset()}/> Use driving sequence in playback</label>
      <div class="field-grid">
        <label>Length (ms)<Input aria-label="Sequence length (ms)" type="number" min="1000" max="600000" step="1000" value={edit.durationMs} onchange={event=>number(event,retime)}/></label>
        <label>Title starts (ms)<Input aria-label="Sequence title starts (ms)" type="number" min="0" step="1" value={edit.titleAtMs} onchange={event=>number(event,titleAtMs=>sequence({titleAtMs:Math.round(titleAtMs)}))}/></label>
      </div>
      <p class="help">Length rescales camera beats, the bridge turn and the title. Garage cues follow the title using their saved offsets. Save config above to use this edit in the opening.</p>
      <h3>Garage ending</h3>
      <label class="toggle"><input aria-label="Garage ending enabled" type="checkbox" checked={edit.garage.enabled} onchange={event=>changeGarage({enabled:event.currentTarget.checked})}/> Finish inside garage</label>
      {#if edit.garage.enabled}
        <p class="help">Arrival is relative to TITLE: negative milliseconds enter earlier. The along-road trim also shifts arrival by driving time. Drag DOOR, GARAGE or HOLD for exact timing. Position the bay on the final straight.</p>
        <div class="field-grid">{#each garageFields as field}
          <label>{field.label}<Input aria-label={field.label} type="number" min={field.min} max={field.max} step={field.step} value={edit.garage[field.key] as number} onchange={event=>number(event,value=>changeGarage({[field.key]:value}))}/></label>
        {/each}</div>
        <label class="toggle"><input aria-label="Hold camera inside garage" type="checkbox" checked={edit.garage.holdCamera} onchange={event=>changeGarage({holdCamera:event.currentTarget.checked})}/> Hold camera inside garage</label>
        <label class="toggle"><input aria-label="Fade city inside garage" type="checkbox" checked={edit.garage.fade} onchange={event=>changeGarage({fade:event.currentTarget.checked})}/> Fade city inside garage</label>
        <p class="help">Door {Math.round(garage.openAtMs)} ms · arrival {Math.round(garage.entryAtMs)} ms · hold {Math.round(garage.holdAtMs)} ms. The car brakes inside the bay; camera hold fixes its world pose. Fade affects the city, while title and audio keep their own timing.</p>
      {/if}
      <h3>Driving and seat</h3>
      <label>Travel mode<select aria-label="Driving travel mode" value={edit.travelMode} onchange={event=>sequence({travelMode:event.currentTarget.value as DrivingSequence['travelMode']})}><option value="cruise">Cruise · constant speed</option><option value="pan">Legacy · pan distance and brake</option></select></label>
      {#if edit.travelMode==='cruise'}
        <div class="field-grid">
          <label>Speed (km/h)<Input aria-label="Driving speed (km/h)" type="number" min="1" max="200" step="5" value={edit.speedKph} onchange={event=>number(event,speedKph=>sequence({speedKph}))}/></label>
          <label>Start X (m)<Input aria-label="Driving start X (m)" type="number" min="-10000" max="10000" step="10" value={edit.startX} onchange={event=>number(event,startX=>sequence({startX}))}/></label>
        </div>
        <label class="toggle"><input aria-label="Continue driving after last beat" type="checkbox" checked={edit.continueDriving} onchange={event=>sequence({continueDriving:event.currentTarget.checked})}/> Continue after last beat</label>
        <p class="help">Speed and start position move the bridge junction along the shore at its scheduled time. Negative Landscape → Travel speed reverses the coastal direction.</p>
      {:else}<p class="help">Uses Landscape → Camera pan distance and slowdown. Duration determines speed.</p>{/if}
      <label class="toggle"><input aria-label="Lock camera to driver seat" type="checkbox" checked={edit.seatLocked} onchange={event=>sequence({seatLocked:event.currentTarget.checked})}/> Lock camera to driver seat</label>
      {#if edit.seatLocked}
        <div class="vector">{#each ['X','Y','Z'] as axis,i}<label>Seat {axis} (m)<Input aria-label={`Driver seat ${axis}`} type="number" step=".02" value={edit.seatPosition[i]} onchange={event=>number(event,value=>sequence({seatPosition:edit.seatPosition.map((v,j)=>j===i?value:v) as DrivingSequence['seatPosition']}))}/></label>{/each}</div>
        <p class="help">One seat position for the whole edit. Camera beats change viewing direction and lens; the car carries the camera around the bend and up the bridge.</p>
      {/if}
      {#if beat}
        <h3>Camera beat</h3>
        <label>Name<Input aria-label="Camera beat name" value={beat.name} onchange={event=>changeBeat({name:event.currentTarget.value})}/></label>
        <div class="field-grid">
          <label>Arrive (ms)<Input aria-label="Camera beat arrival (ms)" type="number" min="0" step="1" value={beat.atMs} disabled={beat.atMs===0} onchange={event=>number(event,atMs=>changeBeat({atMs:Math.round(atMs)}))}/></label>
          <label>FOV (°)<Input aria-label="Camera beat FOV" type="number" min="15" max="110" step="1" value={beat.fov} onchange={event=>number(event,fov=>changeBeat({fov}))}/></label>
          <label>Roll (°)<Input aria-label="Camera beat roll" type="number" min="-45" max="45" step=".5" value={beat.roll} onchange={event=>number(event,roll=>changeBeat({roll}))}/></label>
          <label>Arrive using<select aria-label="Camera beat easing" value={beat.easing} onchange={event=>changeBeat({easing:event.currentTarget.value as CameraBeat['easing']})}><option value="smooth">Smooth</option><option value="linear">Linear</option><option value="cut">Cut</option></select></label>
        </div>
        {#if !edit.seatLocked}
        <label>Camera relative to<select aria-label="Camera coordinate space" value={beat.space} onchange={event=>changeBeat(cameraSpace(beat!,event.currentTarget.value as CameraBeat['space'],world))}><option value="car">Moving car</option><option value="world">World · fixed position</option></select></label>
        <div class="vector">{#each ['X','Y','Z'] as axis,i}<label>{axis} (m)<Input aria-label={`Camera position ${axis}`} type="number" step=".05" value={beat.position[i]} onchange={event=>number(event,value=>changeBeat({position:beat!.position.map((v,j)=>j===i?value:v) as CameraBeat['position']}))}/></label>{/each}</div>
        {/if}
        <label>Look at<select aria-label="Camera target" value={beat.target} onchange={event=>changeBeat({target:event.currentTarget.value as CameraBeat['target'],lookAt:event.currentTarget.value==='car-direction'?[1,0,0]:[0,0,0]})}>{#each targets as target}<option value={target}>{targetNames[target]}</option>{/each}</select></label>
        {#if beat.target==='car-direction'}
          <div class="buttons"><Button variant="outline" onclick={()=>aim(133,6)}>Rear</Button><Button variant="outline" onclick={()=>aim(90,7)}>Side window</Button><Button variant="outline" onclick={()=>aim(0,2)}>Windshield</Button></div>
          <div class="field-grid"><label>Turn (°)<Input aria-label="Camera direction yaw" type="number" min="-180" max="180" step="1" value={Math.round(aimYaw*100)/100} onchange={event=>number(event,value=>aim(value,aimPitch))}/></label><label>Tilt (°)<Input aria-label="Camera direction pitch" type="number" min="-89" max="89" step="1" value={Math.round(aimPitch*100)/100} onchange={event=>number(event,value=>aim(aimYaw,value))}/></label></div>
          <p class="help">Turn: 0° windshield, 90° driver window, 180° rear. Positive tilt looks up. Directions stay attached to the car as it turns.</p>
        {:else}
        <div class="vector">{#each ['X','Y','Z'] as axis,i}<label>{beat.target==='point'?'Point':'Offset'} {axis}<Input aria-label={`Camera aim ${axis}`} type="number" step=".1" value={beat.lookAt[i]} onchange={event=>number(event,value=>changeBeat({lookAt:beat!.lookAt.map((v,j)=>j===i?value:v) as CameraBeat['lookAt']}))}/></label>{/each}</div>
        <p class="help">Subject offsets are world metres; positive Y looks higher. Narrow previews widen the lens gently while retaining the same seat.</p>
        {/if}
        <Button variant="outline" disabled={beat.atMs===0||edit.frames.length<=2} onclick={()=>{sequence({frames:edit.frames.filter(item=>item.id!==selected)});selected=edit.frames[0].id;}}>Remove camera beat</Button>
      {/if}
      <h3>Car and road</h3>
      <div class="preview-options"><label><input type="checkbox" checked={edit.cabin} onchange={event=>sequence({cabin:event.currentTarget.checked})}/> Cabin</label><label><input type="checkbox" checked={edit.road} onchange={event=>sequence({road:event.currentTarget.checked})}/> Road</label></div>
      <label class="toggle"><input aria-label="Panoramic roof glass" type="checkbox" checked={edit.panoramicRoof} onchange={event=>sequence({panoramicRoof:event.currentTarget.checked})}/> Panoramic roof glass</label>
      <div class="preview-options"><label><input aria-label="Blackout cabin" type="checkbox" checked={edit.cabinBlackout} onchange={event=>sequence({cabinBlackout:event.currentTarget.checked})}/> Blackout cabin</label></div>
      <div class="field-grid">
        <label>Road width (m)<Input aria-label="Sequence road width" type="number" min="3" max="30" step=".25" value={edit.roadWidth} onchange={event=>number(event,roadWidth=>sequence({roadWidth}))}/></label>
        <label>Shoulder (m)<Input aria-label="Sequence road shoulder" type="number" min=".2" max="10" step=".1" value={edit.shoulder} onchange={event=>number(event,shoulder=>sequence({shoulder}))}/></label>
        <label>Cabin light<Input aria-label="Cabin light" type="number" min="0" max="4" step=".1" value={edit.cabinLight} onchange={event=>number(event,cabinLight=>sequence({cabinLight}))}/></label>
        <label>Glass tint<Input aria-label="Cabin glass tint" type="number" min="0" max="1" step=".05" value={edit.glassTint} onchange={event=>number(event,glassTint=>sequence({glassTint}))}/></label>
        <label>Glass / mirror reflections<Input aria-label="Cabin glass reflections" type="number" min="0" max="1" step=".05" value={edit.glassReflection} onchange={event=>number(event,glassReflection=>sequence({glassReflection}))}/></label>
      </div>
      <p class="help">Blackout keeps the interior unlit, including during lightning. Glass tint and reflections remain visible. The roof is solid by default; enable Panoramic roof glass to look through it. Turn blackout off to use Cabin light.</p>
      <h3>Riverbank and bridge</h3>
      <div class="preview-options"><label><input type="checkbox" checked={edit.bank} onchange={event=>sequence({bank:event.currentTarget.checked})}/> Land behind the road</label><label><input type="checkbox" checked={edit.bridge} onchange={event=>sequence({bridge:event.currentTarget.checked})}/> Turn onto bridge</label></div>
      <div class="field-grid">
        <label>Bridge turn (ms)<Input aria-label="Bridge turn starts (ms)" type="number" step="100" min="0" value={edit.junctionAtMs} onchange={event=>number(event,junctionAtMs=>sequence({junctionAtMs:Math.round(junctionAtMs)}))}/></label>
        <label>Turn radius (m)<Input aria-label="Bridge turn radius" type="number" step="5" min="35" max="180" value={edit.turnRadius} onchange={event=>number(event,turnRadius=>sequence({turnRadius}))}/></label>
        <label>Bridge rise (m)<Input aria-label="Bridge rise" type="number" step=".5" min="2" max="40" value={edit.bridgeRise} onchange={event=>number(event,bridgeRise=>sequence({bridgeRise}))}/></label>
        <label>Climb before turn (m)<Input aria-label="Bridge approach length (m)" type="number" step="10" min="40" max="600" value={edit.bridgeApproach} onchange={event=>number(event,bridgeApproach=>sequence({bridgeApproach}))}/></label>
        <label>Bank buildings<Input aria-label="Near bank building density" type="number" step=".1" min="0" max="2" value={edit.bankBuildings} onchange={event=>number(event,bankBuildings=>sequence({bankBuildings}))}/></label>
        <label>Road lighting<Input aria-label="Road lighting" type="number" step=".1" min="0" max="4" value={edit.roadLights} onchange={event=>number(event,roadLights=>sequence({roadLights}))}/></label>
        <label>Light pool radius (m)<Input aria-label="Road light pool radius" type="number" step=".5" min="4" max="24" value={edit.roadLightRadius} onchange={event=>number(event,roadLightRadius=>sequence({roadLightRadius}))}/></label>
        <label>Streetlight color<input aria-label="Streetlight color" type="color" value={edit.roadLightColor} onchange={event=>sequence({roadLightColor:event.currentTarget.value})}/></label>
        <label>Lamp spacing (m)<Input aria-label="Road lamp spacing" type="number" step="2" min="16" max="80" value={edit.lampSpacing} onchange={event=>number(event,lampSpacing=>sequence({lampSpacing}))}/></label>
      </div>
      <p class="help">Light pools follow the lamps along the road and bridge; radius is measured on level pavement. The near bank and road furniture rebuild only when their layout changes. Road smog and end fog are in Landscape → Weather.</p>
    </aside>
  </div>
  <p role="status" class="error">{error}</p>
</div>

<style>
  .event.garage-cue { background:#344e49; top:24px; } .event.hold-cue { background:#41464d; top:44px; }
  .events-track { min-height:70px; }
  .sequence-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:16px; margin-bottom:16px; }
  h2 { font:600 28px var(--hud-font); } h3 { font-size:14px; font-weight:600; margin:20px 0 12px; }
  p, .help { font-size:11px; color:var(--muted-foreground); line-height:1.6; } .help { margin-top:10px; }
  .sequence-layout { display:grid; grid-template-columns:minmax(0,1fr) 330px; gap:20px; align-items:start; }
  .preview-surround { display:flex; justify-content:center; background:#070a09; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  .shot-screen { position:relative; overflow:hidden; flex-shrink:0; }
  .shot-label { position:absolute; bottom:12px; left:12px; background:#101310c0; color:#c8ccc7; font:10px monospace; padding:6px 9px; border-radius:3px; pointer-events:none; }
  .transport, .buttons, .preview-options { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  .transport { margin:12px 0; font-size:11px; } .transport select { width:auto; padding:5px 8px; }
  .preview-options { margin:10px 0; gap:18px; font-size:11px; color:var(--muted-foreground); }
  .preview-options label, .toggle { display:flex; align-items:center; gap:7px; }
  .preview-options span { margin-left:auto; } input[type=checkbox] { width:15px; height:15px; }
  aside { border:1px solid var(--border); background:var(--card); border-radius:8px; padding:0 16px 16px; }
  aside label { display:block; font-size:11px; color:var(--muted-foreground); margin-bottom:10px; }
  aside label :global(input), aside select { margin-top:5px; height:31px; padding:5px 7px; font-size:11px; }
  aside .toggle { display:flex; } .toggle input { margin:0; }
  .field-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 8px; } .vector { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .timeline { position:relative; margin-top:14px; background:#121816; border:1px solid var(--border); border-radius:5px; overflow:hidden; }
  .ruler { height:27px; position:relative; border-bottom:1px solid var(--border); } .ruler span { position:absolute; top:6px; font:9px monospace; color:#8b9790; border-left:1px solid #6b7667; padding-left:4px; }
  .track { position:relative; border-bottom:1px solid var(--border); overflow:hidden; } .camera-track { height:56px; } .events-track { height:37px; } .audio-track { height:45px; }
  .camera-beat { position:absolute; top:5px; bottom:5px; padding:6px 7px; text-align:left; background:#243932; border:1px solid #405a4e; border-radius:3px; color:#bfccc1; cursor:ew-resize; font-size:10px; touch-action:none; overflow:hidden; }
  .camera-beat.selected { background:#413024; border-color:var(--primary); color:#edd7c9; } .beat-diamond { display:block; font-size:9px; margin-bottom:3px; }
  .event { position:absolute; top:5px; padding:4px; background:#485567; color:#dce7f2; border-radius:3px; font:10px monospace; cursor:ew-resize; touch-action:none; }
  .title-cue { background:#6c3b30; color:#f2d9c1; } .track-caption { position:absolute; left:7px; top:4px; font:8px monospace; letter-spacing:.1em; color:#8b9790; pointer-events:none; z-index:1; }
  .audio-track svg { position:absolute; top:5px; height:40px; opacity:.7; } .audio-track line { stroke:#638c83; stroke-width:.7; }
  .playhead { position:absolute; top:0; bottom:0; width:1px; background:#e8d3bb; pointer-events:none; } .playhead::before { content:''; position:absolute; top:0; left:-4px; border:4px solid transparent; border-top-color:#e8d3bb; }
  .empty-track { display:block; padding:18px 10px; font-size:11px; color:#8b9790; } .error { color:#e48d7c; min-height:20px; margin-top:10px; }
  .buttons a { font-size:11px; color:var(--primary); padding:8px; }
  @media(max-width:1050px) { .sequence-layout { grid-template-columns:1fr; } aside { max-height:none; } }
</style>
