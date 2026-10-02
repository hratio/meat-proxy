import { z } from 'zod';

export function filterRules(text: string) {
  return text.split(/\r?\n/).map((text, index) => ({ text: text.trim(), line: index + 1 })).filter(rule => rule.text);
}

const rulesSchema = z.object({
  text: z.string().max(20000).default(''),
  regex: z.boolean().default(false)
}).superRefine((rules, context) => {
  if (!rules.regex) return;
  for (const rule of filterRules(rules.text)) {
    try { new RegExp(rule.text); }
    catch (error) {
      context.addIssue({ code: 'custom', path: ['text'], message: `Line ${rule.line}: ${error instanceof Error ? error.message : 'Invalid regular expression'}` });
    }
  }
});

export const fileFilterFieldsSchema = z.object({
  name: z.string().trim().min(1, 'Enter a filter name.').max(60),
  include: rulesSchema.prefault({}),
  exclude: rulesSchema.prefault({})
});
export const fileFilterPresetSchema = fileFilterFieldsSchema.extend({ id: z.string().min(1).max(100) });
export type FileFilterPreset = z.infer<typeof fileFilterPresetSchema>;

// Early filter configs stored the preset array directly. Normalize it before
// merging defaults so both empty arrays and saved filters survive the upgrade.
export function migrateFileFilterSettings<T extends Record<string, unknown>>(input: T): T {
  return input && Array.isArray(input.fileFilters) ? { ...input, fileFilters: { presets: input.fileFilters } } : input;
}

// Rules in one box are alternatives. Excludes win within their preset; selected
// presets are alternatives too, like the selected file types in the filter menu.
export function matchingPresetPaths(paths: string[], presets: FileFilterPreset[]) {
  if (!presets.length) return paths;
  const compile = (rules: FileFilterPreset['include']) => filterRules(rules.text).map(({ text }) => {
    if (!rules.regex) return (path: string) => path.includes(text);
    const expression = new RegExp(text);
    return (path: string) => expression.test(path);
  });
  const matchers = presets.map(preset => ({ include: compile(preset.include), exclude: compile(preset.exclude) }));
  return paths.filter(path => matchers.some(({ include, exclude }) =>
    (!include.length || include.some(matches => matches(path))) && !exclude.some(matches => matches(path))));
}
