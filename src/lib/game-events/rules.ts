import type { AdlibClip } from '../adlibs/schema';
import type { GameEventContent, GameEvent, GameEventRule } from './schema';
import type { GameCue } from './types';

export type GameEventCounter = { id: string; count: number; threshold: number; played: number };
export type GameRuleStatus = { counters: GameEventCounter[]; playing?: string; lastRule?: string };
export type TriggeredGameCue = { rule: string; cue: GameCue };
type State = GameEventCounter & { lastAt: number };

function matches(rule: GameEventRule, event: GameEvent) {
  if (event.type !== 'shot') return rule.events.includes(event.type);
  const weaponId = event.weapon.split('/').pop()?.replace(/\.glb(?:[?#].*)?$/, '') || event.weapon;
  return (!rule.weapons.length || rule.weapons.includes(event.weapon) || rule.weapons.includes(weaponId))
    && (rule.events.includes('weapon-shot') || (event.background && rule.events.includes('background-shot')));
}

function cueFor(rule: GameEventRule, voice?: AdlibClip): GameCue {
  const message = rule.transmission;
  return {
    key: rule.id, priority: message ? 100 : rule.interrupt ? 10 : 0,
    mode: rule.interrupt ? 'immediate' : 'queue', expiresMs: message || rule.hud ? 15000 : 1200,
    voice,
    hud: rule.hud ? { request: { ...rule.hud } } : undefined,
    transmission: message ? {
      title: message.title, text: message.text || voice?.text || voice?.name || '',
      portrait: { request: { expression: message.expression } }, splash: message.splash,
      durationSec: message.durationSec, movement: message.movement,
      introSeconds: message.introSeconds, outroSeconds: message.outroSeconds
    } : undefined
  };
}

export function createGameEventRules(config: GameEventContent, random = Math.random) {
  const states = new Map<string, State>(), lastClips = new Map<string, string>();
  const threshold = (rule: GameEventRule) => rule.minCount + Math.floor(random() * (rule.maxCount - rule.minCount + 1));
  const reset = () => {
    states.clear(); lastClips.clear();
    for (const rule of config.events.rules) states.set(rule.id, { id: rule.id, count: 0, threshold: threshold(rule), played: 0, lastAt: -Infinity });
  };
  reset();
  return {
    reset,
    counters: (): GameEventCounter[] => [...states.values()].map(({ lastAt, ...state }) => ({ ...state })),
    emit(events: GameEvent[], now: number, eligible: (rule: GameEventRule) => boolean = () => true): TriggeredGameCue | undefined {
      const matched = new Set<string>();
      for (const event of events) for (const rule of config.events.rules) {
        if (!rule.enabled || !matches(rule, event)) continue;
        matched.add(rule.id);
        const state = states.get(rule.id)!;
        if (rule.incrementChance > 0 && (rule.incrementChance === 1 || random() < rule.incrementChance)) state.count = Math.min(state.threshold, state.count + 1);
      }
      for (const rule of config.events.rules) {
        const state = states.get(rule.id)!;
        if (!eligible(rule) || !matched.has(rule.id) || state.count < state.threshold || now - state.lastAt < rule.cooldownMs) continue;
        let clip: AdlibClip | undefined;
        const selection = rule.voice;
        if (selection) {
          if ('clip' in selection) clip = config.adlibs.clips.find(clip => clip.enabled && clip.id === selection.clip);
          else {
            const clips = config.adlibs.clips.filter(clip => clip.enabled && clip.category === selection.category);
            const choices = clips.length > 1 ? clips.filter(clip => clip.id !== lastClips.get(selection.category)) : clips;
            clip = choices[Math.floor(random() * choices.length)];
            if (clip) lastClips.set(selection.category, clip.id);
          }
          if (!clip) continue;
        }
        state.count = 0; state.threshold = threshold(rule); state.lastAt = now; state.played++;
        return { rule: rule.id, cue: cueFor(rule, clip) };
      }
    }
  };
}
