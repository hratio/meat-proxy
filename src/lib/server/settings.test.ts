import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'smol-toml';
import { configSchema, catalogSchema, defaults } from '../config';

let directory: string, settings: typeof import('./settings');
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'meat-proxy-settings-'));
  vi.stubEnv('MEAT_PROXY_CONFIG', join(directory, 'config.toml'));
  vi.resetModules();
  settings = await import('./settings');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('initial settings and project catalog are valid and persist edited values', async () => {
  const { config, catalog } = await settings.loadSettings();
  expect(configSchema.safeParse(config).success).toBe(true);
  expect(catalogSchema.safeParse(catalog).success).toBe(true);
  config.display.fontSize = 18;
  catalog.name = 'Project rules';
  await settings.saveSettings(config);
  await settings.saveCatalog(catalog);
  const reloaded = await settings.loadSettings();
  expect(reloaded.config.display.fontSize).toBe(18);
  expect(reloaded.catalog).toEqual(catalog);
  const stored = parse(await readFile(settings.configPath, 'utf8'));
  expect(stored).not.toHaveProperty('server');
  expect(stored).not.toHaveProperty('review');
});

test('legacy full configurations retain personal choices and use current runtime defaults', async () => {
  const legacy = structuredClone(defaults);
  legacy.display.fontSize = 18;
  legacy.server.maxFiles = 1;
  await writeFile(settings.configPath, stringify(legacy));
  const { config } = await settings.loadSettings();
  expect(config.display.fontSize).toBe(18);
  expect(config.server.maxFiles).toBe(defaults.server.maxFiles);
  expect(parse(await readFile(settings.configPath, 'utf8'))).not.toHaveProperty('server');
});

test('invalid preferences, duplicate catalog IDs and malformed TOML cannot silently replace saved data', async () => {
  const { config, catalog } = await settings.loadSettings();
  const savedConfig = await readFile(settings.configPath, 'utf8');
  const savedCatalog = await readFile(settings.catalogPath, 'utf8');
  await expect(settings.saveSettings({ ...config, display: { ...config.display, fontSize: -1 } })).rejects.toThrow();
  await expect(settings.saveCatalog({ ...catalog, groups: [...catalog.groups, catalog.groups[0]] })).rejects.toThrow(/unique/);
  expect(await readFile(settings.configPath, 'utf8')).toBe(savedConfig);
  expect(await readFile(settings.catalogPath, 'utf8')).toBe(savedCatalog);
  await writeFile(settings.configPath, '[invalid');
  await expect(settings.loadSettings()).rejects.toThrow();
  expect(await readFile(settings.configPath, 'utf8')).toBe('[invalid');
});
