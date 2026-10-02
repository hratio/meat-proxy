import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'smol-toml';
import { config as dotenv } from 'dotenv';
import { configSchema, userConfigSchema, catalogSchema, catalogReadSchema, defaults, type Config, type Catalog } from '$lib/config';
import { mergeDefaults, type Overrides } from '$lib/tuning';
import { defaultCatalog } from '$lib/catalog';
import { migrateHudSettings } from '$lib/hud-config';
import { migrateFileFilterSettings } from '$lib/file-filter-presets';
import { defaultShellTheme, isShellTheme } from '$lib/ui/shell-themes';
import { shellColorStyle, type ShellColors } from '$lib/ui/shell-colors';
import { validateBindings } from '$lib/experience';
import { migrateDestructionMark } from '$lib/destruction/completion';

dotenv({ path: resolve(process.env.MEAT_PROXY_REPO || process.cwd(), '.env'), quiet: true });
dotenv({ path: resolve(process.env.MEAT_PROXY_PACKAGE_ROOT || process.cwd(), '.env'), quiet: true });

export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'meat-proxy');
export const configPath = process.env.MEAT_PROXY_CONFIG || join(configDir, 'config.toml');
export const catalogPath = join(dirname(configPath), 'catalog.json');
export const appName = process.env.MEAT_PROXY_NAME || 'meat-proxy';

export async function atomicWrite(path: string, data: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, data, { mode: 0o600 });
  await rename(temporary, path);
}

async function readOptional(path: string) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

// Read only the shell preference for the initial HTML. Bootstrap still reports
// invalid configs normally; a malformed file must not prevent the error UI loading.
export async function readShellAppearance() {
  try {
    const text = await readOptional(configPath);
    const display = text ? parse(text).display as Record<string, unknown> | undefined : undefined;
    return { theme: isShellTheme(display?.shellTheme) ? display.shellTheme : defaultShellTheme, style: shellColorStyle((display ?? {}) as ShellColors) };
  } catch { return { theme: defaultShellTheme, style: '' }; }
}

export async function loadSettings(): Promise<{ config: Config; catalog: Catalog }> {
  const text = await readOptional(configPath);
  const original = text ? parse(text) : {};
  const stored = migrateFileFilterSettings(migrateHudSettings(original));
  const migrateHud = JSON.stringify(stored) !== JSON.stringify(original);
  const bindings = stored.bindings as Record<string, string> | undefined;
  // New default shortcuts must not take over a user's existing custom binding.
  for (const [command, shortcut] of [['destroyFile', 'b'], ['destroyAll', 'shift+b']]) {
    if (bindings && bindings[command] === undefined && Object.values(bindings).some(value => value.toLowerCase() === shortcut)) bindings[command] = '';
  }
  let migrateReview = false;
  for (const [command, previous, next] of [['nextFile', ']', 'j'], ['prevFile', 'shift+space', 'k'], ['prevFile', '[', 'k']]) {
    if (bindings?.[command] === previous && !Object.values(bindings).some(key => key.toLowerCase() === next)) {
      bindings[command] = next; migrateReview = true;
    }
  }
  const migrateControls = bindings && bindings.completeFile === undefined;
  if (migrateControls) {
    // Move the previous defaults without overwriting custom shortcuts.
    if (bindings.comment === 'space' && !Object.values(bindings).includes('t')) bindings.comment = 't';
    if (bindings.prevFile === '[' && !Object.values(bindings).includes('shift+space')) bindings.prevFile = 'shift+space';
    bindings.completeFile = ['space', 'alt+enter', 'ctrl+shift+enter'].find(key => !Object.values(bindings).includes(key)) || 'ctrl+alt+shift+enter';
  }
  const migrateTheme = !(stored.display as Record<string, unknown> | undefined)?.shellTheme;
  // Older versions saved the entire runtime config here. Keep personal controls
  // and let all developer tuning come from the current Studio defaults.
  const personal = userConfigSchema.parse(mergeDefaults(defaults, stored as Overrides<Config>));
  const config = configSchema.parse(mergeDefaults(defaults, personal));
  const catalogText = await readOptional(catalogPath);
  const storedCatalog = catalogText ? JSON.parse(catalogText) : defaultCatalog;
  const catalog = migrateDestructionMark(catalogReadSchema.parse(storedCatalog), original, !!catalogText);
  if (!catalogText || !catalogSchema.safeParse(storedCatalog).success || catalog.destructionMark !== storedCatalog.destructionMark) await atomicWrite(catalogPath, JSON.stringify(catalog, null, 2));
  if (!text || migrateControls || migrateHud || migrateReview || migrateTheme || JSON.stringify(original) !== JSON.stringify(personal)) {
    await atomicWrite(configPath, stringify(personal));
  }
  return { config, catalog };
}

export async function saveSettings(config: Config) {
  const parsed = configSchema.parse(config);
  validateBindings(parsed);
  await atomicWrite(configPath, stringify(userConfigSchema.parse(parsed)));
  return parsed;
}

export async function saveCatalog(catalog: unknown) {
  const parsed = catalogReadSchema.parse(catalog);
  await atomicWrite(catalogPath, JSON.stringify(parsed, null, 2));
  return parsed;
}
