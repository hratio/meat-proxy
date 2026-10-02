import { readFile, mkdir, rename, readdir, unlink, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { appName, atomicWrite, configPath, loadSettings, saveCatalog, saveSettings } from './settings';
import { currentHead, digest, pinSelection, readCommitContents, readDiff, repository, commitPage } from './git';
import { VersionStore } from './versions';
import type { ReviewPlatform } from '../review/platform';

export const serverPlatform: ReviewPlatform = {
  appName, configPath, root: process.env.MEAT_PROXY_REPO || process.cwd(),
  dataDirectory: repo => resolve(process.env.MEAT_PROXY_DATA_DIR || join(repo.commonDir, 'meat-proxy')),
  connection: dataDir => ({ name: appName, url: process.env.MEAT_PROXY_URL || 'http://127.0.0.1:5173', token: process.env.MEAT_PROXY_TOKEN, pid: process.pid, dataDir }),
  join, digest, fs: { readFile, mkdir, rename, readdir, unlink, cp, atomicWrite },
  loadSettings, saveCatalog, saveSettings, currentHead, pinSelection, readCommitContents, readDiff, repository, commitPage,
  createVersions: (directory, review, config) => new VersionStore(directory, review, config)
};
