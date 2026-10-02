type Value = string | Uint8Array | null;
export const join = (...parts: string[]) => '/' + parts.join('/').split('/').filter(Boolean).reduce<string[]>((path, part) => {
  if (part === '..') path.pop(); else if (part !== '.') path.push(part); return path;
}, []).join('/');
const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';
const missing = (path: string) => Object.assign(new Error(`No file at ${path}`), { code: 'ENOENT' });

/** Disposable files, directories and immutable blobs for one demo page. */
export class BrowserFiles {
  private values = new Map<string, Value>([['/', null]]);
  private async set(path: string, value: Value) {
    this.values.set(path, value);
  }
  readFile = async (path: string, _encoding: 'utf8' = 'utf8') => {
    const value = this.values.get(path);
    if (value === undefined || value === null) throw missing(path);
    return typeof value === 'string' ? value : new TextDecoder().decode(value);
  };
  mkdir = async (path: string, _options = { recursive: true }) => {
    for (let length = 1, parts = path.split('/').filter(Boolean); length <= parts.length; length++) {
      const directory = '/' + parts.slice(0, length).join('/');
      if (!this.values.has(directory)) await this.set(directory, null);
    }
  };
  atomicWrite = async (path: string, value: string | Uint8Array) => {
    await this.mkdir(parent(path));
    await this.set(path, typeof value === 'string' ? value : value.slice());
  };
  readdir = async (path: string) => {
    if (!this.values.has(path)) throw missing(path);
    return [...this.values.keys()].filter(key => key !== path && parent(key) === path).map(key => key.slice(path === '/' ? 1 : path.length + 1));
  };
  unlink = async (path: string) => {
    if (!this.values.delete(path)) throw missing(path);
  };
  rename = async (from: string, to: string) => { await this.atomicWrite(to, await this.readFile(from)); await this.unlink(from); };
  cp = async (from: string, to: string, _options = { recursive: true }) => {
    if (!this.values.has(from)) throw missing(from);
    for (const [path, value] of [...this.values]) if (path === from || path.startsWith(from + '/')) {
      const target = to + path.slice(from.length);
      if (value === null) await this.mkdir(target); else await this.atomicWrite(target, value);
    }
  };
}
