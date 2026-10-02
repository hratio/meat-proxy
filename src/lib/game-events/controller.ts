import { createGameEventRules, type GameRuleStatus } from './rules';
import { createAdlibVoice, type AdlibVoice } from '../adlibs/voice';
import type { GameEventContent, GameEvent } from './schema';
import { transmissionSchema, type TransmissionSettings } from '../transmission-config';
import type { ActiveTransmission, GameCue, GameEventsState, TransmissionDismissed } from './types';

type Item = { id: number; cue: GameCue; priority: number; expires: number };
type Running = Item & {
  hud: boolean; voice: boolean; transmission?: ActiveTransmission; elapsed: number; outroReady: boolean;
  voiceState: 'waiting' | 'playing' | 'silent' | 'done'; duration: number;
};
type Preferences = { sound: boolean; adlibs: boolean; volume: number; reducedMotion: boolean; transmissions: TransmissionSettings };

export function createGameEvents(initial: GameEventContent, ports: {
  onchange: (state: GameEventsState) => void;
  onrules?: (state: GameRuleStatus) => void;
  ondismiss?: (event: TransmissionDismissed) => void;
  onreset?: () => void;
  onerror?: (url: string) => void;
  voice?: AdlibVoice;
}) {
  const voice = ports.voice ?? createAdlibVoice(ports.onerror ?? (() => {}));
  let config = initial, rules = createGameEventRules(initial), sequence = 0, now = 0, quietUntil = 0;
  let disposed = false, draining = false, lastRule: string | undefined;
  let preferences: Preferences = { sound: false, adlibs: false, volume: 0, reducedMotion: false, transmissions: transmissionSchema.parse({}) };
  let queue: Item[] = [];
  const running = new Map<number, Running>();
  const active = () => [...running.values()];
  const notify = () => {
    const all = active(), hud = all.find(r => r.hud);
    ports.onchange({
      transmission: all.find(r => r.transmission)?.transmission,
      hud: hud?.cue.hud ? { id: hud.id, cue: hud.cue.hud } : undefined,
      voice: voice.playing,
      queued: queue.map(item => ({ id: item.id, key: item.cue.key || 'Reaction', priority: item.priority }))
    });
    ports.onrules?.({ counters: rules.counters(), playing: voice.playing, lastRule });
  };
  const retire = (r: Running) => { if (!r.hud && !r.voice && !r.transmission) running.delete(r.id); };
  const endVoice = (r: Running) => {
    r.voice = false;
    // A synchronous cancellation callback cannot affect a successor.
    r.voiceState = 'done';
    voice.cancel();
    retire(r);
  };
  const enterOutro = (r: Running) => {
    if (!r.transmission || r.transmission.phase !== 'speaking') return;
    r.transmission = { ...r.transmission, phase: 'outro' }; r.elapsed = 0; notify();
  };
  const speak = (r: Running) => {
    if (r.transmission) r.transmission = { ...r.transmission, phase: 'speaking' };
    r.elapsed = 0;
    if (!r.cue.voice || !voice.enabled) r.voiceState = 'silent';
    else {
      r.voiceState = 'waiting';
      voice.play(r.cue.voice, {
        started(duration) {
          if (!running.has(r.id) || r.voiceState !== 'waiting') return;
          r.duration = duration; r.elapsed = 0; r.voiceState = 'playing';
          if (r.transmission) r.transmission = { ...r.transmission, durationMs: duration };
          notify();
        },
        ended(result) {
          if (!running.has(r.id) || r.voiceState === 'done') return;
          if (r.transmission && !['outro', 'shattering'].includes(r.transmission.phase)) {
            if (result === 'ended') { r.voiceState = 'done'; enterOutro(r); }
            else r.voiceState = 'silent'; // Muted/failed audio uses the manifest's remaining reading time.
          } else if (!r.transmission) {
            r.voice = false; r.voiceState = 'done'; quietUntil = now + config.adlibs.gapMs; retire(r);
          }
          drain(); notify();
        }
      });
    }
    if (!r.transmission && r.voiceState === 'silent') { r.voice = false; retire(r); }
    notify();
  };
  function drain() {
    if (disposed || draining) return;
    draining = true;
    queue = queue.filter(item => item.expires > now).sort((a, b) => b.priority - a.priority || a.id - b.id);
    for (const item of [...queue]) {
      const wantsTransmission = !!item.cue.transmission && preferences.transmissions.enabled;
      const wantsVoice = wantsTransmission || (!!item.cue.voice && voice.enabled);
      const all = active(), owner = all.find(r => r.voice);
      if (item.cue.hud && all.some(r => r.hud)) continue;
      if (wantsTransmission && all.some(r => r.transmission)) continue;
      if (wantsVoice && owner && (owner.transmission || item.cue.mode !== 'immediate' || item.priority < owner.priority)) continue;
      if (wantsVoice && !wantsTransmission && item.cue.mode !== 'immediate' && now < quietUntil) continue;
      // Acquire the entire requested set before replacing an interruptible voice.
      if (wantsVoice && owner) endVoice(owner);
      queue = queue.filter(i => i !== item);
      const duration = (item.cue.voice?.durationSec ?? item.cue.transmission?.durationSec ?? Math.max(2.5, (item.cue.transmission?.text.length || 0) / 18)) * 1000;
      const r: Running = { ...item, hud: !!item.cue.hud, voice: wantsVoice, elapsed: 0, duration, voiceState: 'waiting', outroReady: false };
      if (wantsTransmission) r.transmission = {
        id: item.id, cue: item.cue.transmission!, phase: 'covering', durationMs: duration,
        introMs: (item.cue.transmission!.introSeconds ?? preferences.transmissions.introSeconds) * 1000,
        outroMs: (item.cue.transmission!.outroSeconds ?? preferences.transmissions.outroSeconds) * 1000
      };
      running.set(r.id, r);
      if (!r.transmission) speak(r);
      retire(r);
    }
    draining = false;
  }
  const play = (cue: GameCue) => {
    if (disposed) return;
    const id = ++sequence;
    // Snapshot authored settings; editing Studio cannot mutate an active event.
    cue = structuredClone(cue);
    if (cue.key) queue = queue.filter(item => item.cue.key !== cue.key);
    queue.push({ id, cue, priority: cue.priority ?? 0, expires: now + (cue.expiresMs ?? 15000) });
    queue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    queue = queue.slice(0, 8);
    drain(); notify(); return id;
  };
  const reset = () => {
    queue = []; running.clear(); voice.cancel(); rules.reset(); quietUntil = 0; lastRule = undefined; ports.onreset?.(); notify();
  };
  const finishTransmission = (r: Running) => {
    const shot = r.transmission?.phase === 'shattering';
    r.transmission = undefined;
    endVoice(r);
    if (shot) ports.ondismiss?.({ type: 'transmission-dismissed', id: r.id, key: r.cue.key, reason: 'shot' });
  };
  return {
    play, reset,
    unlock: voice.unlock,
    configure(next: GameEventContent) { reset(); config = next; rules = createGameEventRules(next); voice.preferences({ enabled: preferences.sound && preferences.adlibs, volume: preferences.volume, gain: config.adlibs.gain }); notify(); },
    preferences(next: Preferences) {
      preferences = next;
      voice.preferences({ enabled: next.sound && next.adlibs, volume: next.volume, gain: config.adlibs.gain });
      if (!next.transmissions.enabled) {
        queue = queue.map(item => ({ ...item, cue: { ...item.cue, transmission: undefined } }));
        for (const r of active()) if (r.transmission) finishTransmission(r);
      }
      drain(); notify();
    },
    preload() { return voice.preload(config.adlibs.clips); },
    emit(event: GameEvent | GameEvent[]) {
      if (disposed) return;
      const events = Array.isArray(event) ? event : [event];
      const all = active(), protectedVoice = all.some(r => r.transmission), busy = all.some(r => r.voice) || now < quietUntil;
      const selected = rules.emit(events, now, rule => {
        // Transmission rules may queue even when they cannot interrupt. Casual
        // counters remain saturated without consuming a clip while protected.
        if (rule.transmission || rule.hud) return true;
        return voice.enabled && !protectedVoice && (!busy || rule.interrupt);
      });
      if (selected) {
        lastRule = selected.rule;
        play(selected.cue);
      }
      notify();
    },
    hudFinished(id: number) { const r = running.get(id); if (r?.hud) { r.hud = false; retire(r); drain(); notify(); } },
    /** The presentation acknowledges only after the HUD shutter has actually been drawn closed. */
    hudCovered(id: number) {
      const r = running.get(id);
      if (r?.transmission?.phase !== 'covering') return;
      r.transmission = { ...r.transmission, phase: 'intro' }; r.elapsed = 0; notify();
    },
    /** Release the transmission only after its message, shutter and fade have completed. */
    transmissionFinished(id: number) {
      const r = running.get(id);
      if (r?.transmission?.phase !== 'outro') return;
      r.outroReady = true;
      if (r.elapsed >= r.transmission.outroMs) { finishTransmission(r); drain(); notify(); }
    },
    shoot(id: number, point: { x: number; y: number }) {
      const r = running.get(id);
      if (!r?.transmission || r.transmission.phase === 'shattering' || r.transmission.phase === 'covering') return false;
      r.transmission = { ...r.transmission, phase: 'shattering', shot: point }; r.elapsed = 0;
      r.voiceState = 'done'; voice.cancel();
      queue = queue.filter(item => !item.cue.transmission);
      notify(); return true;
    },
    /** The arena owns the reaction clock, independently of audio audibility. */
    advance(deltaMs: number) {
      if (disposed) return;
      now += Math.max(0, deltaMs);
      for (const r of active()) {
        if (!r.transmission || r.transmission.phase === 'covering') continue;
        r.elapsed += Math.max(0, deltaMs);
        const t = r.transmission;
        if (t.phase === 'intro' && r.elapsed >= t.introMs) speak(r);
        else if (t.phase === 'speaking' && ((r.voiceState === 'silent' && r.elapsed >= r.duration) || r.elapsed >= r.duration + 2000)) {
          r.voiceState = 'done'; voice.cancel(); enterOutro(r);
        } else if ((t.phase === 'outro' && r.outroReady && r.elapsed >= t.outroMs) || (t.phase === 'shattering' && r.elapsed >= (preferences.reducedMotion ? 0 : 720))) {
          finishTransmission(r); drain(); notify();
        }
      }
      if (queue.length) { const before = queue.map(i => i.id).join(); drain(); if (before !== queue.map(i => i.id).join()) notify(); }
    },
    dispose() { disposed = true; reset(); voice.dispose(); }
  };
}
