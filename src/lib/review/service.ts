import type { Catalog, Config } from '../config';
import type { Repository, Selection, SelectionInput } from '../types';
import { agentFeedbackSchema, type AgentFeedback } from '../comment-threads';
import { createReviewEngine, type ReviewEngine, type ReviewExpectation } from './engine';
import type { ReviewPlatform } from './platform';

/** One storage owner, with one engine and mutation queue per review. */
export class ReviewService {
  repo!: Repository;
  dataDir!: string;
  config!: Config;
  catalog!: Catalog;
  private engines = new Map<string, ReviewEngine>();
  private chain: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private preferred?: string;

  constructor(private platform: ReviewPlatform) {}

  async init() {
    Object.assign(this, await this.platform.loadSettings());
    this.repo = await this.platform.repository(this.platform.root, this.config);
    this.dataDir = this.platform.dataDirectory(this.repo);
    for (const directory of ['reviews', 'inbox', 'outbox']) await this.platform.fs.mkdir(this.platform.join(this.dataDir, directory), { recursive: true });
    try { this.preferred = JSON.parse(await this.platform.fs.readFile(this.platform.join(this.dataDir, 'active.json'), 'utf8')).id; }
    catch (error) { if ((error as { code?: string }).code !== 'ENOENT') throw error; }
    await this.platform.fs.atomicWrite(this.platform.join(this.dataDir, 'connection.json'), JSON.stringify(this.platform.connection(this.dataDir), null, 2));
    this.scheduleInbox();
    return this;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('The server is reloading. Try again.'));
    const next = this.chain.then(work);
    this.chain = next.catch(() => {});
    return next;
  }

  private identity(selection: Selection) {
    return JSON.stringify([this.repo.commonDir, selection.worktree, selection.mode, ...(selection.mode === 'compare' ? [selection.targetOid, selection.sourceOid] : [])]);
  }

  private async open(id?: string, selection?: SelectionInput): Promise<ReviewEngine> {
    if (id && !/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid review ID.');
    if (id && this.engines.has(id)) return this.engines.get(id)!;
    if (!id) {
      const pinned = await this.platform.pinSelection(selection || this.repo.suggestion, this.repo, this.config);
      const identity = this.identity(pinned);
      const loaded = [...this.engines.values()].find(engine => this.identity(engine.review.selection) === identity);
      if (loaded) return loaded;
      // Preserve IDs from earlier schema versions, just as Engine.select does.
      const candidates: { id: string; updatedAt: string }[] = [];
      for (const name of await this.platform.fs.readdir(this.platform.join(this.dataDir, 'reviews'))) {
        if (!/^[a-f0-9]{24}\.json$/.test(name)) continue;
        const review = JSON.parse(await this.platform.fs.readFile(this.platform.join(this.dataDir, 'reviews', name), 'utf8'));
        if (this.identity(review.selection) === identity) candidates.push(review);
      }
      id = candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id;
      // Pin refs once: a branch moving while opening cannot select a different pair.
      selection = pinned.mode === 'compare' ? { ...pinned, sourceRef: pinned.sourceOid!, targetRef: pinned.targetOid } : pinned;
    }
    const engine = await createReviewEngine(this.platform).init({ reviewId: id, selection, managed: true });
    engine.syncSettings(this.config, this.catalog);
    this.engines.set(engine.review.id, engine);
    return engine;
  }

  get(id?: string, worktree?: string) {
    return this.serialize(async () => {
      if (worktree) this.repo = await this.platform.repository(this.platform.root, this.config);
      if (!id && !worktree && this.preferred && !this.engines.has(this.preferred)) {
        // A reopening preference must not strand the app after a worktree or
        // saved review is removed. Explicit review URLs still report the error.
        try {
          const review = JSON.parse(await this.platform.fs.readFile(this.platform.join(this.dataDir, 'reviews', `${this.preferred}.json`), 'utf8'));
          if (!this.repo.worktrees.some(tree => tree.path === review.selection.worktree)) this.preferred = undefined;
        } catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') throw error;
          this.preferred = undefined;
        }
      }
      return this.open(id || (!worktree ? this.preferred : undefined), worktree ? { mode: 'live', worktree } : undefined);
    });
  }

  select(from: ReviewEngine, selection: SelectionInput, decision?: 'save' | 'discard', reset = false, expected?: ReviewExpectation) {
    return this.serialize(async () => {
      this.repo = await this.platform.repository(this.platform.root, this.config);
      await this.platform.pinSelection(selection, this.repo, this.config);
      // Validate the destination before applying the tab's save/discard decision.
      const destination = await this.open(undefined, selection);
      if (reset && destination !== from) throw new Error('Open this review before restarting it.');
      const left = await from.leave(decision, expected);
      if (reset) {
        await destination.select(selection, undefined, true, left);
      }
      this.preferred = destination.review.id;
      await this.platform.fs.atomicWrite(this.platform.join(this.dataDir, 'active.json'), JSON.stringify({ id: destination.review.id, selection: destination.review.selection }, null, 2));
      return destination;
    });
  }

  settings<T>(engine: ReviewEngine, update: () => Promise<T>) {
    return this.serialize(async () => {
      const result = await update();
      this.config = engine.config; this.catalog = engine.catalog;
      await Promise.all([...this.engines.values()].filter(other => other !== engine).map(other => other.serialize(async () => other.syncSettings(this.config, this.catalog))));
      return result;
    });
  }

  agentFeedback(input: AgentFeedback) {
    return this.serialize(async () => (await this.open(input.reviewId)).agentFeedback(input));
  }

  private scheduleInbox() {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.serialize(async () => {
          const inbox = this.platform.join(this.dataDir, 'inbox');
          for (const name of (await this.platform.fs.readdir(inbox)).filter(name => name.endsWith('.json'))) {
            const path = this.platform.join(inbox, name);
            try {
              const input = agentFeedbackSchema.parse(JSON.parse(await this.platform.fs.readFile(path, 'utf8')));
              await (await this.open(input.reviewId)).agentFeedback(input);
              await this.platform.fs.unlink(path);
            } catch (error) {
              await this.platform.fs.rename(path, `${path}.rejected`);
              for (const engine of this.engines.values()) engine.events.emit('fault', `Agent inbox ${name}: ${String(error)}`);
            }
          }
        });
      } catch (error) {
        if (!this.stopped) for (const engine of this.engines.values()) engine.events.emit('fault', String(error));
      }
      this.scheduleInbox();
    }, this.config.server.pollMs);
    this.timer.unref?.();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.chain;
    await Promise.all([...this.engines.values()].map(engine => engine.stop()));
    this.engines.clear();
  }
}
