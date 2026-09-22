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
    let raw = null;
    try {
      raw = localStorage.getItem('hi-anzy-lab.projects.v1');
    } catch (e) {
      raw = '<localStorage denied>';
    }
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
      ids = ['<idb unavailable>'];
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
      /* Any word on screen that would be a lie without proven capability. */
      claimsSaved: /saved in this browser|is being saved/i.test(document.body.innerText) &&
        !/nothing is being saved/i.test(document.body.innerText),
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

  const runCase = async (label, seed, after, initScript) => {
    const ctx = await page.context().browser().newContext();
    if (initScript) await ctx.addInitScript(initScript);
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

  /* ===== C · INDEX ROW WITH NO BODY ===================================== */
  out.push(
    await runCase(
      'C index row with no body (ghost is `last`)',
      async (p) => {
        await p.evaluate(PUT_BODIES, [body('proj-present', 1, 'this one is really here')]);
        await p.evaluate(([k, v]) => localStorage.setItem(k, v), [
          KEY,
          JSON.stringify({
            schemaVersion: 1,
            projects: [row('proj-ghost', 'listed but never written', 1758000009000), row('proj-present', 'this one is really here')],
            last: 'proj-ghost',
          }),
        ]);
        await p.reload();
        await p.waitForTimeout(1400);
      },
      /* The other project must still open. */
      async (p) => {
        const open = p.locator('.os-saved button', { hasText: 'OPEN' }).first();
        if (!(await open.count())) return { couldOpenOther: 'NO OPEN BUTTON' };
        await open.click();
        await p.waitForTimeout(1600);
        const s = await readSurface(p);
        return { couldOpenOther: s.title, afterOpenNotice: s.notice, afterOpenKv: s.kv };
      },
    ),
  );

  /* ===== D · DUPLICATE PROJECT ID ======================================= */
  out.push(
    await runCase('D duplicate project id in the index', async (p) => {
      await p.evaluate(PUT_BODIES, [body('proj-dupe', 1, 'the surviving body behind two rows')]);
      await p.evaluate(([k, v]) => localStorage.setItem(k, v), [
        KEY,
        JSON.stringify({
          schemaVersion: 1,
          projects: [
            { id: 'proj-dupe', createdAt: 1758000000000, updatedAt: 1758000001000, title: 'OLDER ROW', excerpt: 'older', artifactCount: 0 },
            { id: 'proj-dupe', createdAt: 1758000000000, updatedAt: 1758000009000, title: 'NEWER ROW', excerpt: 'newer', artifactCount: 9 },
          ],
          last: null,
        }),
      ]);
      await p.reload();
      await p.waitForTimeout(1400);
    }),
  );

  /* ===== E1 · LOCALSTORAGE REFUSED ====================================== */
  out.push(
    await runCase(
      'E1 localStorage throws (site data disabled)',
      null,
      async (p) => {
        const term = p.locator('input').first();
        await term.click();
        await term.fill('diagnose nothing here should ever be called saved');
        await p.keyboard.press('Enter');
        await p.waitForTimeout(2200);
        return await readSurface(p);
      },
      () => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('The operation is insecure.', 'SecurityError');
          },
        });
      },
    ),
  );

  /* ===== E2 · INDEXEDDB ABSENT ========================================== */
  out.push(
    await runCase(
      'E2 indexedDB absent (bodies cannot be written)',
      null,
      async (p) => {
        const term = p.locator('input').first();
        await term.click();
        await term.fill('diagnose the body store is gone but the list still works');
        await p.keyboard.press('Enter');
        await p.waitForTimeout(2200);
        return await readSurface(p);
      },
      () => {
        Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => undefined });
      },
    ),
  );

  return out;
}
