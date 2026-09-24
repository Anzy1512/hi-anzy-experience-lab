/**
 * THE ONE PLACE THIS SURFACE TALKS TO THE SERVICE.
 *
 * ── THE KEY IS NEVER IN THE BUILD ───────────────────────────────────────────
 *
 * The audit service holds a key that can spend money and fetch pages on
 * somebody else's instruction. Baking that into a JavaScript bundle would
 * publish it to everyone who loads the page, so the surface asks for it and
 * keeps it in this tab: in memory, and in `sessionStorage` if the reader says
 * so, which dies with the tab. Nothing is ever written to `localStorage`, and
 * no build-time variable carries a credential.
 *
 * ── AND NOT REACHING THE SERVICE IS A STATE, NOT AN ERROR ───────────────────
 *
 * This surface is served from the same repository as a Lab that runs with no
 * backend at all. It has to behave the same way: when nothing answers, it says
 * what it tried and what that means, and it shows no numbers. The one thing it
 * must never do is render a plausible empty state that reads like a finished
 * search of an empty world.
 */

export interface ServiceCapabilities {
  synthesis: boolean;
  jobs: boolean;
  directIngestion: boolean;
  model: { available: boolean; detail: string };
  search: { configured: boolean; providers: Array<{ id: string; label: string; ok: boolean; detail: string }> };
}

export type Reach =
  | { state: 'UNCONFIGURED'; detail: string }
  | { state: 'PROBING'; detail: string }
  | { state: 'ONLINE'; detail: string; capabilities: ServiceCapabilities }
  | { state: 'UNAUTHORISED'; detail: string }
  | { state: 'UNREACHABLE'; detail: string };

/** Where the service is. A build-time default, overridable at runtime. */
export const DEFAULT_BASE =
  (import.meta.env['VITE_AUDIT_API'] as string | undefined) ?? 'http://127.0.0.1:8787';

const KEY_STORAGE = 'hi-anzy-audit-key';

export class AuditClient {
  base: string;
  private key: string;

  constructor(base = DEFAULT_BASE, key = '') {
    this.base = base.replace(/\/+$/, '');
    this.key = key;
  }

  hasKey(): boolean {
    return this.key.length > 0;
  }

  setKey(key: string, remember: boolean): void {
    this.key = key;
    /*
     * Wrapped, and correct without it. A private window, blocked site data or
     * a thumbnail capture can make every one of these throw or come back
     * empty, and a research surface that cannot start because storage is
     * unavailable would be a poor instrument.
     */
    try {
      if (remember) sessionStorage.setItem(KEY_STORAGE, key);
      else sessionStorage.removeItem(KEY_STORAGE);
    } catch {
      /* the key still works for this session; only the convenience is lost */
    }
  }

  static rememberedKey(): string {
    try {
      return sessionStorage.getItem(KEY_STORAGE) ?? '';
    } catch {
      return '';
    }
  }

  private headers(): Record<string, string> {
    return { 'content-type': 'application/json', authorization: `Bearer ${this.key}` };
  }

  /**
   * Ask the service what it can do.
   *
   * Every distinguishable failure is a distinguishable state: no key is not the
   * same problem as a wrong key, and a wrong key is not the same problem as
   * nothing listening. A single "error" would leave the reader guessing at
   * which of three unrelated things to fix.
   */
  async reach(signal?: AbortSignal): Promise<Reach> {
    if (!this.hasKey()) {
      return { state: 'UNCONFIGURED', detail: 'No key has been entered, so nothing has been asked of the service.' };
    }
    try {
      const res = await fetch(`${this.base}/v1/capabilities`, {
        headers: this.headers(),
        ...(signal !== undefined ? { signal } : {}),
      });
      if (res.status === 401) {
        return { state: 'UNAUTHORISED', detail: `${this.base} answered, and refused the key.` };
      }
      if (!res.ok) {
        return { state: 'UNREACHABLE', detail: `${this.base} answered ${res.status}.` };
      }
      const capabilities = (await res.json()) as ServiceCapabilities;
      return { state: 'ONLINE', detail: `${this.base}`, capabilities };
    } catch (err) {
      return {
        state: 'UNREACHABLE',
        detail:
          `Nothing answered at ${this.base}` +
          (err instanceof Error && err.message !== '' ? ` (${err.message})` : '') +
          '. The service is a separate process; it is not part of this page.',
      };
    }
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
    try {
      const res = await fetch(`${this.base}${path}`, { ...init, headers: this.headers() });
      const text = await res.text();
      const parsed: unknown = text === '' ? null : JSON.parse(text);
      if (!res.ok) {
        const body = parsed as { error?: string; detail?: string; problems?: string[] } | null;
        return {
          ok: false,
          status: res.status,
          detail:
            body?.problems?.join(' ') ??
            [body?.error, body?.detail].filter(Boolean).join(' — ') ??
            `HTTP ${res.status}`,
        };
      }
      return { ok: true, data: parsed as T };
    } catch (err) {
      return { ok: false, status: 0, detail: err instanceof Error ? err.message : 'the request failed' };
    }
  }

  get<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
    return this.call<T>(path);
  }

  post<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
    return this.call<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }
}

/* -------------------------------------------------------------------------- */
/* THE SHAPES THIS SURFACE READS                                               */
/* -------------------------------------------------------------------------- */

export interface Finding {
  statement: string;
  status: string;
  type: string;
  reasoning: string;
  rule: string | null;
  citations: string[];
  limitations: string;
  entityId: string | null;
  area: string | null;
}

export interface EvidenceItem {
  id: string;
  label: string;
  url: string | null;
  kind: string;
  text: string;
}

export interface AnswerBody {
  runId: string;
  question: string;
  intent: string;
  termination: string;
  summary: string | null;
  summarySource: string;
  findings: {
    established: Finding[];
    gaps: Finding[];
    conflicts: Finding[];
    recommendations: Finding[];
    withheldCount: number;
  };
  evidence: EvidenceItem[];
  coverage: { verdict: string; sourcesChecked: number; entitiesConsidered: number; unresolvedFields: string[] };
  cost: {
    modelCalls: number;
    tokensIn: number;
    tokensOut: number;
    costMicros: number | null;
    pagesCrawled: number;
    searches: number;
    evidenceConsidered: number;
    evidenceUsed: number;
    durationMs: number;
  };
  limitations: string[];
  plan: { intent: string; steps: Array<{ id: string; description: string; source: string; modelClass: string; rationale: string; skipped?: { reason: string } }>; deterministicOnly: boolean; openQuestions: string[] };
}

export interface JobSummary {
  id: string;
  question: string;
  intent: string | null;
  state: string;
  termination: string | null;
  project_id: string | null;
  model_calls: number;
  tool_calls: number;
  pages_crawled: number;
  searches: number;
  cost_micros: number | null;
  created_at: string;
  finished_at: string | null;
}

export interface JobDetail {
  job: JobSummary & { limitations: string[]; iterations: number; error: string | null };
  progress: { total: number; done: number; failed: number; skipped: number; pending: number };
  tasks: Array<{
    key: string;
    kind: string;
    agent: string;
    state: string;
    dependsOn: string[];
    rationale: string;
    attempts: number;
    error: string | null;
  }>;
}

export interface JobTrace {
  steps: Array<{
    task: string;
    agent: string;
    turn: number;
    purpose: string;
    note: string;
    new_observations: number;
    new_entities: number;
    new_findings: number;
  }>;
  toolCalls: Array<{
    task: string;
    agent: string;
    tool: string;
    outcome: number;
    result: string | null;
    duration_ms: number | null;
    pages_crawled: number;
    searches: number;
  }>;
}

export interface JobFindings {
  findings: Array<{
    id: string;
    statement: string;
    status: string;
    finding_type: string;
    reasoning_type: string;
    rule_id: string | null;
    limitations: string | null;
    entity_id: string | null;
    citations: Array<{ quote: string; url: string; retrieved_at: string }>;
  }>;
  withheldCount: number;
}

export interface MapBody {
  located: Array<{ id: string; name: string; type: string; latitude: number; longitude: number; city: string | null; country: string | null }>;
  unlocated: number;
  note: string;
}
