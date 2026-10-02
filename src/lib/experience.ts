import type { Config } from './config';

export type ExperienceMode = Config['experience']['mode'];
export type Command = keyof Config['bindings'];

// Command scopes drive input, help, settings, and binding validation.
export const commandScope = {
  mainGroupPrev: 'game', mainGroupNext: 'game', mainCodePrev: 'game', mainCodeNext: 'game',
  secondaryGroupPrev: 'game', secondaryGroupNext: 'game', secondaryCodePrev: 'game', secondaryCodeNext: 'game',
  mainToggle: 'game', secondaryToggle: 'game', mainFire: 'game', secondaryFire: 'game',
  erase: 'shared', reload: 'game',
  destroyFile: 'game', destroyAll: 'game',
  comment: 'shared', addVcode: 'shared', completeFile: 'shared', toggleFile: 'shared',
  undo: 'shared', redo: 'shared', nextFile: 'shared', prevFile: 'shared', nextUnreviewed: 'shared',
  toggleScroll: 'shared', findings: 'shared'
} as const satisfies Record<Command, 'game' | 'shared'>;

export function commandAvailable(command: string, mode: ExperienceMode) {
  return Object.hasOwn(commandScope, command) && (mode === 'game' || commandScope[command as Command] === 'shared');
}

export function activeBindings(config: Config, mode = config.experience.mode): [Command, string][] {
  return (Object.entries(config.bindings) as [Command, string][])
    .filter(([command]) => commandAvailable(command, mode))
    .map(([command, binding]) => [command, mode === 'review'
      ? config.reviewBindings[command as keyof Config['reviewBindings']] ?? binding : binding]);
}

export function validateBindings(config: Config) {
  for (const mode of ['game', 'review'] as const) {
    const bindings = activeBindings(config, mode).map(([, key]) => key.toLowerCase()).filter(Boolean);
    if (new Set(bindings).size !== bindings.length) throw new Error(`Each ${mode === 'review' ? 'Serious mode' : 'game'} control needs a different binding.`);
  }
}
