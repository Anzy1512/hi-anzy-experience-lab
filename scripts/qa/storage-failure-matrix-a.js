async (page) => {
  const BASE = 'http://localhost:5173';
  const KEY = 'hi-anzy-lab.projects.v1';

  const PUT_BODIES = async (bodies) => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('hi-anzy-lab', 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('projects')) r.result.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const t = db.transaction('projects', 'readwrite');
      const s = t.objectStore('projects');
      for (const b of bodies) s.put(b);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  };

  const READBACK = async () => {
    const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
    let ids = [];
    try {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('hi-anzy-lab', 1);
        r.onupgradeneeded = () => {
          if (!r.result.objectStoreNames.contains('projects')) r.result.createObjectStore('projects', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      ids = await new Promise((res) => {
        const q = db.transaction('projects', 'readonly').objectStore('projects').getAllKeys();
        q.onsuccess = () => res(q.result);
        q.onerror = () => res([]);
      });
      db.close();
    } catch (e) {
      ids = ['<idb error>'];
    }
    return { raw, ids };
  };

  const body = (id, v, statement) => ({
    schemaVersion: v,
    id,
    createdAt: 1758000000000,
    updatedAt: 1758000001000,
    title: null,
    statement,
    constraints: [],
    artifacts: [],
    history: [{ at: 1758000000000, kind: 'PROJECT_CREATED', note: 'Seeded by the failure matrix.' }],
    work: null,
  });
  const row = (id, statement, updatedAt = 1758000001000) => ({
    id,
    createdAt: 1758000000000,
    updatedAt,
    title: null,
    excerpt: statement,
    artifactCount: 0,
  });

  const readSurface = (p) =>
    p.evaluate(() => ({
      alive: !!document.querySelector('.modehost'),
      notice: document.querySelector('.os-prj__notice')?.textContent?.trim() ?? null,
      where: document.querySelector('.os-prj__where')?.textContent?.trim() ?? null,
      kv: [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | '),
      alsoSaved: [...document.querySelectorAll('.os-saved li')].map((li) =>
        li.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
      ),
      title: document.querySelector('.os-prj__title')?.textContent?.trim() ?? null,
    }));

  const openPanel = async (p) => {
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2400);
    if (!(await p.evaluate(() => !!document.querySelector('.modehost__chrome')))) return false;
    const term = p.locator('input').first();
    await term.click();
    await term.fill('open system');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1500);
    return true;
  };

  const runCase = async (label, seed, after) => {
    const ctx = await page.context().browser().newContext();
    const p = await ctx.newPage();
    const pageErrors = [];
    p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
    let rec;
    try {
      await p.goto(BASE);
      await p.waitForTimeout(500);
      if (seed) await seed(p);
      if (!(await openPanel(p))) {
        rec = { case: label, FATAL: '!! MODE NOT LOADED (void)' };
      } else {
        const surface = await readSurface(p);
        const extra = after ? await after(p) : null;
        const back = await p.evaluate(READBACK);
        rec = { case: label, ...surface, storedIds: back.ids, rawIndex: back.raw ? back.raw.slice(0, 300) : null, extra, pageErrors };
      }
    } catch (e) {
      rec = { case: label, THREW: String(e).slice(0, 280), pageErrors };
    }
    await ctx.close();
    return rec;
  };

  const out = [];

  /* ===== A1 · FUTURE SCHEMA VERSION IN THE INDEX ======================== */
  out.push(
    await runCase(
      'A1 future index version (v99 index, v1 body)',
      async (p) => {
        await p.evaluate(PUT_BODIES, [body('proj-future-a', 1, 'a v1 body under a v99 index')]);
        await p.evaluate(([k, v]) => localStorage.setItem(k, v), [
          KEY,
          JSON.stringify({ schemaVersion: 99, projects: [row('proj-future-a', 'a v1 body under a v99 index')], last: 'proj-future-a' }),
        ]);
        await p.reload();
        await p.waitForTimeout(1200);
      },
      /* Then MAKE something so a write is attempted, and see what survives. */
      async (p) => {
        const term = p.locator('input').first();
        await term.click();
        await term.fill('diagnose our checkout leaks users and nobody can say where');
        await p.keyboard.press('Enter');
        await p.waitForTimeout(2400);
        const back = await p.evaluate(READBACK);
        const after = await readSurface(p);
        return {
          afterWriteRawIndex: back.raw ? back.raw.slice(0, 340) : null,
          afterWriteIds: back.ids,
          afterWriteNotice: after.notice,
        };
      },
    ),
  );

  /* ===== A2 · FUTURE SCHEMA VERSION IN A PROJECT BODY =================== */
  out.push(
    await runCase('A2 future body version (v1 index, v99 body + a good one)', async (p) => {
      await p.evaluate(PUT_BODIES, [body('proj-future-b', 99, 'written by a newer build'), body('proj-ok-b', 1, 'an ordinary readable project')]);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [
        KEY,
        JSON.stringify({
          schemaVersion: 1,
          projects: [row('proj-future-b', 'written by a newer build', 1758000009000), row('proj-ok-b', 'an ordinary readable project')],
          last: 'proj-future-b',
        }),
      ]);
      await p.reload();
      await p.waitForTimeout(1200);
    }),
  );

  /* ===== B · CORRUPT (TRUNCATED, NON-JSON) INDEX ======================== */
  out.push(
    await runCase('B corrupt index, two good bodies', async (p) => {
      await p.evaluate(PUT_BODIES, [body('proj-corrupt-1', 1, 'first survivor of a torn index'), body('proj-corrupt-2', 1, 'second survivor of a torn index')]);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, '{"schemaVersion":1,"projects":[{"id":"pro']);
      await p.reload();
      await p.waitForTimeout(1600);
    }),
  );

  return out;
}
