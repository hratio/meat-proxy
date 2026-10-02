import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { z } from 'zod';
import type { ReviewEngine } from '../review/engine';

const requestSchema = z.object({ reviewId: z.string().min(1), path: z.string().min(1).max(4096).refine(value => !value.includes('\0')) });
type Launch = { executable: string; args: string[] };

export function editorLaunch(executable: string, file: string, platform = process.platform, env = process.env, exists = existsSync): Launch {
  if (executable) {
    if (platform === 'darwin' && executable.endsWith('.app')) return { executable: '/usr/bin/open', args: ['-a', executable, file] };
    if (platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) throw new Error('Choose the editor’s .exe file instead of a .cmd or .bat launcher.');
    return { executable, args: [file] };
  }
  if (platform === 'darwin') return { executable: '/usr/bin/open', args: ['-a', 'Visual Studio Code', file] };
  if (platform === 'win32') {
    const directories = [
      env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code'),
      env.ProgramFiles && win32.join(env.ProgramFiles, 'Microsoft VS Code'),
      env['ProgramFiles(x86)'] && win32.join(env['ProgramFiles(x86)'], 'Microsoft VS Code'),
      ...(env.PATH || env.Path || '').split(';').filter(Boolean).flatMap(path => {
        const directory = path.replace(/^"|"$/g, '');
        return [directory, ...(win32.basename(directory).toLowerCase() === 'bin' ? [win32.dirname(directory)] : [])];
      })
    ];
    const candidates = directories.filter((path): path is string => !!path).map(path => win32.join(path, 'Code.exe'));
    return { executable: candidates.find(path => exists(path)) || 'Code.exe', args: [file] };
  }
  return { executable: 'code', args: [file] };
}

function inside(worktree: string, file: string) {
  const path = relative(worktree, file);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

// Wait briefly for launcher failures, but let long-running GUI editors outlive the request.
export function launchEditor({ executable, args }: Launch, cwd: string): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, detached: true, stdio: 'ignore', windowsHide: true });
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.unref();
      if (error) reject(error); else accept();
    };
    const timer = setTimeout(() => finish(), 1000);
    child.once('error', error => finish(new Error(`Could not start ${executable}: ${error.message}. Check Settings → Review → External editor.`)));
    child.once('exit', (code, signal) => finish(code === 0 ? undefined : new Error(`${executable} could not open the file (${signal || `exit ${code}`}). Check Settings → Review → External editor.`)));
  });
}

export async function openReviewFile(engine: Pick<ReviewEngine, 'config' | 'review' | 'files'>, input: unknown) {
  const { reviewId, path } = requestSchema.parse(input);
  if (!engine.config.editor.enabled) throw new Error('The editor button is disabled in Settings → Review → External editor.');
  if (reviewId !== engine.review.id) throw new Error('The review changed. Refresh before opening the file.');
  if (!engine.files.some(file => file.path === path)) throw new Error('This file is no longer part of the review.');
  const worktree = engine.review.selection.worktree;
  const absolute = resolve(worktree, path);
  if (isAbsolute(path) || win32.isAbsolute(path) || !inside(worktree, absolute)) throw new Error('The file must be inside the review’s worktree.');
  try {
    const [root, target, info] = await Promise.all([realpath(worktree), realpath(absolute), stat(absolute)]);
    if (!inside(root, target)) throw new Error('The file points outside the review’s worktree.');
    if (!info.isFile()) throw new Error('Only files can be opened in the editor.');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) throw new Error('This file does not exist in the review’s worktree. It may have been deleted or only exist in another revision.');
    throw error;
  }
  await launchEditor(editorLaunch(engine.config.editor.executable, absolute), worktree);
  return { ok: true };
}
