#!/usr/bin/env node
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { acquireStorage, StorageOwnedError } from './server-ownership.mjs';
import { config as dotenv } from 'dotenv';
import { parse } from 'smol-toml';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value.`); return args[index + 1]; };
dotenv({ path: resolve(process.cwd(), '.env'), quiet: true });
dotenv({ path: join(packageRoot, '.env'), quiet: true });
dotenv({ path: join(packageRoot, '.env.example'), quiet: true });
const name = process.env.MEAT_PROXY_NAME || 'meat-proxy';

function openBrowser(url) {
  if (args.includes('--no-open')) return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const child = spawn(command, process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`\n${name} — RIP & REVIEW\n\n  npx @hratioed/meat-proxy [--dir path] [--port 6660] [--no-open]\n\n  --dir       Review this Git repository (default: current directory)\n  --port      Local port (or MEAT_PROXY_PORT / config.toml)\n  --config    Path to a TOML configuration\n  --data-dir  Path to review storage\n  --no-open   Do not open a browser\n  --version   Show package version\n\n  Name: MEAT_PROXY_NAME in the working directory's .env\n  Config: ~/.config/meat-proxy/config.toml\n  Agent skill: ${join(packageRoot, 'skills/review-agent/SKILL.md')}\n`);
  process.exit(0);
}
if (args.includes('--version')) { console.log(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version); process.exit(0); }

try {
  const known = new Set(['--help', '-h', '--version', '--dir', '--port', '--config', '--data-dir', '--no-open']);
  for (let i = 0; i < args.length; i++) { if (!known.has(args[i])) throw new Error(`Unknown option: ${args[i]}`); if (['--dir', '--port', '--config', '--data-dir'].includes(args[i])) i++; }
  process.env.MEAT_PROXY_PACKAGE_ROOT = packageRoot;
  process.env.MEAT_PROXY_REPO = resolve(option('--dir') || process.cwd());
  if (option('--config')) process.env.MEAT_PROXY_CONFIG = resolve(option('--config'));
  if (option('--data-dir')) process.env.MEAT_PROXY_DATA_DIR = resolve(option('--data-dir'));
  const configFile = process.env.MEAT_PROXY_CONFIG || join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'meat-proxy', 'config.toml');
  const config = existsSync(configFile) ? parse(readFileSync(configFile, 'utf8')) : {};
  const studioFile = join(packageRoot, 'config/studio.json');
  const studio = existsSync(studioFile) ? JSON.parse(readFileSync(studioFile, 'utf8')) : {};
  const port = Number(option('--port') || process.env.MEAT_PROXY_PORT || config.server?.port || studio.game?.server?.port || 6660);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be between 1024 and 65535.');
  const url = `http://127.0.0.1:${port}`;
  process.env.MEAT_PROXY_URL = url;
  process.env.ORIGIN = url;
  process.env.MEAT_PROXY_TOKEN = randomBytes(32).toString('hex');
  const worktree = execFileSync('git', ['-C', process.env.MEAT_PROXY_REPO, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const commonDir = execFileSync('git', ['-C', worktree, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  const storage = process.env.MEAT_PROXY_DATA_DIR || join(commonDir, 'meat-proxy');
  const launchUrl = `${url}/?worktree=${encodeURIComponent(worktree)}`;
  try { acquireStorage(storage, url); }
  catch (error) {
    if (!(error instanceof StorageOwnedError)) throw error;
    const owner = error.owner;
    let response;
    try { response = await fetch(`${owner.url}/api/server`, { signal: AbortSignal.timeout(3000) }); } catch { /* The owner may still be starting. */ }
    const info = response?.ok ? await response.json() : undefined;
    if (!info || info.pid !== owner.pid || info.repository !== commonDir) throw error;
    const existingUrl = `${owner.url}/?worktree=${encodeURIComponent(worktree)}`;
    console.log(`Using the running ${name} server: ${existingUrl}`);
    openBrowser(existingUrl);
    process.exit(0);
  }
  if (!existsSync(join(packageRoot, 'build/handler.js'))) throw new Error('Build the app first with npm run build.');
  const { handler } = await import(pathToFileURL(join(packageRoot, 'build/handler.js')).href);
  const server = createServer(handler);
  server.on('error', error => { console.error(`\n${name}: ${error.code === 'EADDRINUSE' ? `Port ${port} is busy. Choose --port <number>.` : error.message}`); process.exit(1); });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  \x1b[38;5;208m╔══════════════════════════════╗\n  ║  ${name.toUpperCase().padEnd(26)}║\n  ║  RIP. REVIEW. REPEAT.        ║\n  ╚══════════════════════════════╝\x1b[0m\n\n  Arena   ${url}\n  Repo    ${process.env.MEAT_PROXY_REPO}\n  Config  ${configFile}\n\n  Ctrl+C to holster.\n`);
    openBrowser(launchUrl);
  });
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (closing) return;
    closing = true; server.close();
    try { await (await globalThis.__meatProxyService?.current)?.stop(); }
    finally { server.closeAllConnections(); process.exit(0); }
  });
} catch (error) { console.error(`${name}: ${error.message}`); process.exit(1); }
