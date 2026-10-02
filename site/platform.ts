import { configSchema, userConfigSchema, catalogSchema, defaults } from '../src/lib/config';
import { validateBindings } from '../src/lib/experience';
import { mergeDefaults } from '../src/lib/tuning';
import { migrateFileFilterSettings } from '../src/lib/file-filter-presets';
import demoCatalog from './catalog.json';
import { migrateDestructionMark } from '../src/lib/destruction/completion';
import { createReviewEngine } from '../src/lib/review/engine';
import type { ReviewPlatform } from '../src/lib/review/platform';
import { BrowserFiles, join } from './filesystem';
import { BrowserRepository, digest, root } from './repository';
import { BrowserVersions } from './versions';

export async function createBrowserSession(files: BrowserFiles) {
  const repository = await new BrowserRepository(files).init();
  const read = async (path: string, fallback: unknown) => {
    try { return JSON.parse(await files.readFile(path)); }
    catch (error) { if ((error as { code?: string }).code === 'ENOENT') return structuredClone(fallback); throw error; }
  };
  const loadSettings = async () => {
    const stored = await read('/settings/config.json', defaults);
    const savedCatalog = await read('/settings/catalog.json', null);
    const previousCatalog = catalogSchema.parse(savedCatalog ?? demoCatalog);
    const catalog = migrateDestructionMark(previousCatalog, stored, savedCatalog !== null);
    const personal = userConfigSchema.parse(migrateFileFilterSettings(stored));
    const config = configSchema.parse(mergeDefaults(defaults, personal));
    if (catalog !== previousCatalog) await files.atomicWrite('/settings/catalog.json', JSON.stringify(catalog));
    if (stored?.destruction?.completionMark !== undefined) await files.atomicWrite('/settings/config.json', JSON.stringify(personal));
    return { config, catalog };
  };
  const platform: ReviewPlatform = {
    appName: 'meat-proxy', root, configPath: '/settings/config.json', join, digest, fs: files,
    dataDirectory: () => '/repository.git/meat-proxy',
    connection: dataDir => ({ name: 'meat-proxy', url: 'browser://review', dataDir }),
    loadSettings,
    saveSettings: async value => { const config = configSchema.parse(value); validateBindings(config); await files.atomicWrite('/settings/config.json', JSON.stringify(userConfigSchema.parse(config))); return config; },
    saveCatalog: async value => { const catalog = catalogSchema.parse(value); await files.atomicWrite('/settings/catalog.json', JSON.stringify(catalog)); return catalog; },
    repository: repository.repository, pinSelection: repository.pinSelection, currentHead: repository.currentHead,
    commitPage: repository.commitPage, readDiff: repository.readDiff, readCommitContents: repository.readCommitContents,
    createVersions: (directory, review, config) => new BrowserVersions(directory, review, config, repository, files)
  };
  const engine = await createReviewEngine(platform).init();
  return { engine, platform, repository, files };
}
export type BrowserSession = Awaited<ReturnType<typeof createBrowserSession>>;
