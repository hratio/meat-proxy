type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};

/** Read older Studio files once at the content boundary; saves use events.rules. */
export function migrateGameEventContent(studio: { adlibs?: unknown; events?: unknown }) {
  const { rules, ...adlibs } = object(studio.adlibs);
  const events = studio.events ?? {
    rules: Array.isArray(rules) ? rules.map(value => {
      const { category, reaction: previous, ...rule } = object(value);
      const reaction = object(previous);
      return {
        ...rule,
        voice: category ? { category } : undefined,
        hud: reaction.hud ? { expression: reaction.hud } : undefined,
        transmission: reaction.transmission ? {
          title: reaction.title, expression: reaction.portrait, splash: reaction.splash
        } : undefined
      };
    }) : []
  };
  return { adlibs, events };
}
