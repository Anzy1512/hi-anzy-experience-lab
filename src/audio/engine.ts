/**
 * THE AUDIO ENGINE — one of them, for the whole Lab.
 *
 * Three modes want sound (Director, After Dark, Sonic Architecture) and none of
 * them owns an AudioContext. This does, and it enforces the rules they all
 * share:
 *
 *  - **Nothing exists before consent.** There is no AudioContext, no node graph
 *    and no scheduled event until `enable()` is called from a real user gesture.
 *    Constructing a context on load — even a suspended one — is the thing
 *    browsers warn about and the thing visitors resent, so it does not happen.
 *  - **Everything is reachable for teardown.** Every source and node a scene
 *    creates is registered, so `Scene.dispose()` can stop and disconnect all of
 *    it. `AudioEngine.disable()` then closes the context outright.
 *  - **Silence when unattended.** The context suspends while the tab is hidden
 *    and resumes when it comes back, so a backgrounded tab is not making noise
 *    or burning a thread.
 *
 * There is no `AudioBuffer` loading here and no sample assets: every voice is
 * synthesised (see `voices.ts`), which keeps the payload at zero bytes and
 * sidesteps licensing entirely.
 */

export type AudioState = 'off' | 'starting' | 'on' | 'blocked';

type Listener = (state: AudioState) => void;

class Engine {
  private ctx: AudioContext | null = null;
  /** What scenes connect into — the compressor, not the raw destination. */
  private master: AudioNode | null = null;
  private outGain: GainNode | null = null;
  private _state: AudioState = 'off';
  private listeners = new Set<Listener>();
  private onVisibility: (() => void) | null = null;
  private _muted = false;
  private _gain = 0.6;

  get state(): AudioState {
    return this._state;
  }
  get muted(): boolean {
    return this._muted;
  }
  get context(): AudioContext | null {
    return this.ctx;
  }
  /** The node every scene connects into. Null until enabled. */
  get destination(): AudioNode | null {
    return this.master;
  }
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(state: AudioState) {
    this._state = state;
    this.listeners.forEach((l) => l(state));
  }

  /**
   * Must be called synchronously from a user gesture. Returns whether audio is
   * actually running — a browser that refuses is reported as `blocked`, never
   * papered over.
   */
  async enable(): Promise<boolean> {
    if (this._state === 'on') return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      this.set('blocked');
      return false;
    }
    this.set('starting');
    try {
      const ctx = new Ctor();
      // A compressor before the master keeps a dense scene from clipping, and
      // means no individual voice has to be timid about its own level.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      const master = ctx.createGain();
      master.gain.value = this._muted ? 0 : this._gain;

      comp.connect(master);
      master.connect(ctx.destination);

      this.ctx = ctx;
      this.master = comp; // scenes connect into the compressor
      this.outGain = master; // ...and the master gain downstream is the mute
      await ctx.resume();

      if (ctx.state !== 'running') {
        this.set('blocked');
        return false;
      }

      this.onVisibility = () => {
        if (!this.ctx) return;
        if (document.visibilityState === 'hidden') void this.ctx.suspend();
        else if (this._state === 'on') void this.ctx.resume();
      };
      document.addEventListener('visibilitychange', this.onVisibility);

      this.set('on');
      return true;
    } catch (err) {
      console.warn('[lab] audio could not start', err);
      this.set('blocked');
      return false;
    }
  }

  /** Total teardown. Safe to call any number of times, from anywhere. */
  disable(): void {
    if (this.onVisibility) {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.onVisibility = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.outGain = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* a context that is already closed is the state we wanted */
      }
    }
    this.set('off');
  }

  setGain(g: number): void {
    this._gain = Math.max(0, Math.min(1, g));
    if (!this._muted) this.outGain?.gain.setTargetAtTime(this._gain, this.now, 0.02);
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    // The master gain is the mute; sources keep running, so unmuting is instant
    // and nothing has to be rescheduled.
    this.outGain?.gain.setTargetAtTime(muted ? 0 : this._gain, this.now, 0.02);
  }

  /** A disposable group of nodes belonging to one mode. */
  scene(): Scene | null {
    if (!this.ctx || !this.master) return null;
    return new Scene(this.ctx, this.master);
  }
}

/**
 * A SCENE — everything one mode creates, and one call that removes all of it.
 *
 * Modes never touch the context directly. They ask the scene for nodes, and the
 * scene keeps the list that makes exit cleanup total rather than hopeful.
 */
export class Scene {
  private nodes: AudioNode[] = [];
  private sources: (AudioScheduledSourceNode | OscillatorNode)[] = [];
  private timers: number[] = [];
  private disposed = false;

  readonly ctx: AudioContext;
  readonly out: AudioNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    this.ctx = ctx;
    this.out = out;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  track<T extends AudioNode>(node: T): T {
    if (this.disposed) {
      try {
        node.disconnect();
      } catch {
        /* nothing to disconnect */
      }
      return node;
    }
    this.nodes.push(node);
    return node;
  }

  source<T extends AudioScheduledSourceNode>(node: T): T {
    this.track(node);
    this.sources.push(node);
    return node;
  }

  /** A timer that cannot outlive the scene. */
  after(ms: number, fn: () => void): void {
    if (this.disposed) return;
    const id = window.setTimeout(() => {
      if (!this.disposed) fn();
    }, ms);
    this.timers.push(id);
  }

  /** Stops every source, disconnects every node, cancels every timer. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.length = 0;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped, or never started */
      }
    }
    this.sources.length = 0;
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes.length = 0;
  }
}

export const audio = new Engine();

/**
 * DEV-only observation surface, mirroring the camera probe in Presence.
 * `window.__labAudio.report()` answers "is anything still making sound?" in one
 * call, which is what the cross-mode stress test needs.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __labAudio?: unknown }).__labAudio = {
    report: () => ({
      state: audio.state,
      contextState: audio.context?.state ?? 'none',
      muted: audio.muted,
    }),
  };
}
