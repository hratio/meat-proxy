import type { TutorialStep } from './flow';
import { bindingLabel } from './flow';
import type { Placement } from './placement';

export type TutorialMessage = {
  label: string; title: string; text: string; task?: string; button?: string; note?: string; action?: string; reveal?: string;
  keys?: { label: string; value: string }[]; placement?: Placement;
};
export type TutorialGuideOptions = {
  message: TutorialMessage; step: string; index: number; total: number;
  target: () => Element | undefined; targetScope?: () => Node | undefined;
  onnext: () => void; onskip: () => void; onreveal?: () => void; onaction?: () => void;
};
export type TutorialDialogGuide = { host: 'agent' | 'armory'; guide: TutorialGuideOptions };
export function tutorialContent({ demo, game, shortcut, code, nukeMark, agentPhase = 'idle', feedbackInspected = false, createdCode }: {
  demo: boolean; game: boolean; shortcut: (command: string) => string; code?: string; nukeMark?: string;
  agentPhase?: 'idle' | 'running' | 'complete' | 'error'; feedbackInspected?: boolean; createdCode?: string;
}): Record<TutorialStep, TutorialMessage> {
  const key = (command: string) => bindingLabel(shortcut(command));
  return {
    briefing: { label: 'FIRST MISSION', title: 'Rip. Mark. Dispatch.',
      text: 'Mark a finding, send it to your agent, then make the rules your own.', button: 'Let’s do this',
      note: demo ? 'This is a browser playground. Your local code is safe.' : 'You’re in your live review. Mark something you actually want changed.' },
    loadout: { label: 'YOUR LOADOUT', title: 'Pick your violation.',
      text: 'A V-code is a reusable review rule. You configure what it means; your agent uses it to fix the finding.',
      note: game ? `${code ? `${code} is equipped. ` : ''}Weapons carry your selected V-codes. Customize them in Rules.` : 'Choose a code from the wheel after selecting lines. Customize your codes in Rules.',
      keys: game ? [{ label: 'Category', value: `${key('mainGroupPrev')} / ${key('mainGroupNext')}` },
        { label: 'V-code in category', value: `${key('mainCodePrev')} / ${key('mainCodeNext')}` },
        { label: 'Draw / holster', value: key('mainToggle') }] : [], button: 'Ready to mark', placement: 'above' },
    mark: { label: 'MARK A FINDING', title: game ? 'Make your point.' : 'Select the problem.',
      text: game ? 'Aim at a code line and hold fire. Sweep across more lines to mark a range, then release.' : 'Drag across code lines, release, and choose a V-code from the wheel.',
      keys: game ? [{ label: 'Hold to fire', value: key('mainFire') }] : [], task: 'Mark a code line to continue', reveal: 'Back to code',
      note: game ? `${key('mainToggle')} draws or holsters your weapon. ${key('undo')} undoes the whole burst.` : `${key('undo')} undoes your last mark.`, placement: 'left' },
    inspect: { label: 'FINDING CAPTURED', title: 'Meet your totem.',
      text: 'That badge beside the code is your finding. Hover it to highlight the marked lines. Click it to inspect, resolve, or remove it.',
      note: `${key('comment')} adds a comment at the line you’re pointing at. Use it when a V-code needs more context.`, button: 'Got it', placement: 'left' },
    nuke: { label: 'OPTIONAL · WHOLE-FILE VERDICT', title: 'The nuclear option.',
      text: 'Some files need a stronger verdict. Click the nuclear icon, or use the key below while pointing at this file. Then let it have it.',
      keys: [{ label: 'Nuke file', value: key('destroyFile') }], button: 'Keep it surgical', placement: 'below',
      note: nukeMark ? `Finishing applies ${nukeMark} to the whole file and marks it reviewed.` : 'Choose a V-code or canned response in Rules and enable “Use for destruction” first.',
      action: nukeMark ? undefined : 'Choose nuke verdict' },
    review: { label: 'CLEAR THE FILE', title: 'Finished reading?',
      text: game ? 'Shoot the file’s completion target, or use the key below while pointing at the file. This makes its findings ready to send.' : 'Click the file’s completion target when you’re done reading. This makes its findings ready to send.',
      keys: [{ label: 'Mark file reviewed', value: key('completeFile') }], task: 'Mark this file reviewed', reveal: 'Find completion target',
      note: 'Findings in unfinished files stay held back.', placement: 'left' },
    dispatch: { label: 'SEND THE FINDING', title: 'Put it to work.',
      text: 'Dispatch packages findings from reviewed files with their diffs and rule definitions.',
      note: demo ? 'Then choose “Run simulated agent” to see fixes and feedback in this playground.' : 'Then paste the dispatch instructions into your agent. Dispatch saves the job; you choose when the agent runs.',
      task: 'Click Dispatch to send your finding', placement: 'right' },
    agent: { label: 'AGENT HANDOFF', title: agentPhase === 'complete' ? 'Your agent checked in.' : agentPhase === 'running' ? 'Let it cook.' : 'Send in the agent.',
      text: agentPhase === 'complete' ? 'The reply and changed code are ready. Click Review changes to follow the result.'
        : agentPhase === 'running' ? 'The playground agent is applying demo changes and replying to your finding.'
        : agentPhase === 'error' ? 'The run stopped before it finished. Click Retry agent to try again.'
        : 'Click Run simulated agent. You’ll get changed code and a reply, just like the return trip from your own agent.',
      task: agentPhase === 'complete' ? 'Click Review changes' : agentPhase === 'running' ? 'Agent working…' : agentPhase === 'error' ? 'Retry the simulated agent' : 'Run the simulated agent',
      reveal: 'Open agent outbox', placement: 'left' },
    feedback: { label: 'AGENT FEEDBACK', title: 'Follow the checked marker.',
      text: 'A checked marker is a resolved finding. Open it to read the agent’s reply. Reopen it if the fix needs another pass.',
      note: 'The tutorial keeps this file and its resolved markers visible while you follow the result.',
      task: feedbackInspected ? undefined : 'Open the resolved marker, then close its message',
      button: feedbackInspected ? 'Track the changes' : undefined, reveal: 'Find the result', placement: 'left' },
    history: { label: 'FOLLOW THE CHANGES', title: 'Every pass leaves a trail.',
      text: 'The agent changed this file, so it has a new review round. Click History in the file header to open the timeline.',
      task: 'Click History', reveal: 'Find file history', placement: 'below' },
    rounds: { label: 'REVIEW ROUNDS', title: 'Then. Now. The whole diff.',
      text: 'R1 is your saved review. Current shows what changed since that round. Since HEAD shows the full uncommitted diff.',
      note: 'Past rounds are read-only. Return to Current to keep reviewing.', button: 'Make a V-code', placement: 'below' },
    armory: { label: 'MAKE THE RULES', title: 'Your review. Your rules.',
      text: 'Open Rules to build your own V-code: a named instruction your agent receives with every finding that uses it.',
      task: 'Click Rules in the toolbar', placement: 'below' },
    'new-code': { label: 'YOUR ARMORY', title: 'Add one to the loadout.',
      text: game ? 'Choose a group, then click New V-code. Groups organize your rules; their weapons and totems give them a face.' : 'Choose a group, then click New V-code. Groups organize the instructions you give your agent.',
      task: 'Click New V-code in a group', reveal: 'Open Rules', placement: 'left' },
    'create-code': { label: 'CREATE A V-CODE', title: 'Tell your agent what good looks like.',
      text: game ? 'Give it a short title, a clear instruction, and bad and good examples. Severity sets the priority; the totem and weapon give it a face.' : 'Give it a short title, a clear instruction, and bad and good examples. Severity sets the priority.',
      note: 'Try “Handle empty results” → “Handle an empty result before reading its fields.”',
      task: 'Fill in the rule and both examples, then click Create', reveal: 'Open Rules', placement: 'left' },
    done: { label: 'MISSION COMPLETE', title: 'You’ve got the loop.',
      text: `${createdCode ? `${createdCode} is ready in your armory. ` : ''}Mark. Dispatch. Inspect the reply. Review the next round. Repeat.`,
      note: 'Need a refresher? Replay First steps from the field manual.', button: 'Let’s review' }
  };
}
