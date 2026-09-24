import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';

/**
 * A REAL HTTP SERVER, NOT A MOCKED `fetch`.
 *
 * The crawler's interesting behaviour is not in its own code — it is in how it
 * treats redirects, content types, truncated bodies and Content-Length headers
 * that lie. A stubbed `fetch` tests the stub's idea of those, which is to say
 * it tests nothing: a mock that returns `{status: 302}` cannot prove that the
 * guard re-examines the hop, because a mock has no hop.
 *
 * This means the crawl tests need `CRAWL_ALLOW_PRIVATE_NETWORKS=true`, since
 * 127.0.0.1 is exactly what the guard exists to refuse. That is the flag doing
 * its job: the guard is proven separately against the flag OFF, and the
 * behaviour tests run against the flag ON because there is no other way to
 * drive a redirect chain deterministically.
 */

export interface Fixture {
  server: Server;
  origin: string;
  /** How many times each path has been requested, for cache-behaviour tests. */
  hits: Map<string, number>;
  /** Mutable, so a test can change what a path returns between crawls. */
  routes: Map<string, Route>;
  close(): Promise<void>;
}

export interface Route {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Full control, for the cases the shorthand cannot express. */
  handler?: (req: IncomingMessage, res: ServerResponse) => void;
}

export async function startFixture(routes: Record<string, Route> = {}): Promise<Fixture> {
  const table = new Map<string, Route>(Object.entries(routes));
  const hits = new Map<string, number>();

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    hits.set(path, (hits.get(path) ?? 0) + 1);

    const route = table.get(path);
    if (route === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    if (route.handler) {
      route.handler(req, res);
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': 'text/html; charset=utf-8', ...route.headers });
    res.end(route.body ?? '');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture server has no port');

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
    hits,
    routes: table,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}

/** robots.txt that permits everything. Most fixtures want this. */
export const ALLOW_ALL: Route = {
  headers: { 'content-type': 'text/plain' },
  body: 'User-agent: *\nDisallow:\n',
};

export function page(opts: {
  title?: string;
  description?: string;
  canonical?: string;
  jsonld?: unknown;
  bodyHtml: string;
}): string {
  return [
    '<!doctype html><html lang="en"><head>',
    `<title>${opts.title ?? 'Untitled'}</title>`,
    opts.description ? `<meta name="description" content="${opts.description}">` : '',
    opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : '',
    opts.jsonld ? `<script type="application/ld+json">${JSON.stringify(opts.jsonld)}</script>` : '',
    '</head><body>',
    '<nav>Home About Contact</nav>',
    opts.bodyHtml,
    '<footer>© Example</footer>',
    '</body></html>',
  ].join('');
}

/**
 * A small gzip that expands enormously.
 *
 * The point of the oversize test is not a big download — Content-Length alone
 * catches that. It is a body that is small on the wire and huge in memory,
 * which only a check on DECOMPRESSED bytes can catch.
 */
export function gzipBomb(megabytes: number): { body: Buffer; headers: Record<string, string> } {
  const raw = Buffer.alloc(megabytes * 1024 * 1024, 0x61);
  const body = gzipSync(raw);
  return { body, headers: { 'content-encoding': 'gzip', 'content-type': 'text/html' } };
}
