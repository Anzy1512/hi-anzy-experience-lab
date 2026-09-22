async (page) => {
  const BASE = 'http://localhost:5173';

  const readSurface = async (p) => {
    await p.bringToFront();
    await p.waitForTimeout(500);
    return p.evaluate(() => ({
      notice: document.querySelector('.os-prj__notice')?.textContent?.trim().replace(/\s*UNDERSTOOD$/, '') ?? null,
      kv: [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | '),
      title: document.querySelector('.os-prj__title')?.textContent?.trim() ?? null,
      alsoSaved: [...document.querySelectorAll('.os-saved li')].map((li) =>
        li.textContent.trim().replace(/\s+/g, ' ').slice(0, 70),
      ),
      projectId: window.__labProjectId ?? null,
    }));
  };

  const openPanel = async (p) => {
    await p.bringToFront();
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2400);
    if (!(await p.evaluate(() => !!document.querySelector('.modehost__chrome')))) return false;
    const term = p.locator('input').first();
    await term.click();
    await term.fill('open system');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(1400);
    return true;
  };

  const say = async (p, cmd, ms = 2200) => {
    await p.bringToFront();
    const term = p.locator('input').first();
    await term.click();
    await term.fill(cmd);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(ms);
  };

  /* `project` prints the id-bearing summary; this is a cheaper way to see
     whether two tabs are on the same record. */
  const whichProject = (p) =>
    p.evaluate(() => {
      const el = document.querySelector('.os-prj__title');
      return el ? el.textContent.trim() : null;
    });

  const ctx = await page.context().browser().newContext();
  const errors = [];
  const log = [];

  const A = await ctx.newPage();
  A.on('pageerror', (e) => errors.push('A: ' + String(e).slice(0, 140)));
  let B;

  try {
    /* ---- 1. Tab A makes a project ------------------------------------- */
    if (!(await openPanel(A))) return { FATAL: 'A !! MODE NOT LOADED (void)' };
    await say(A, 'diagnose our conversion is weak and reporting is a mess', 2600);
    log.push({ step: '1 A creates', A: await readSurface(A) });

    /* ---- 2. Tab B opens and should resume the SAME project ------------- */
    B = await ctx.newPage();
    B.on('pageerror', (e) => errors.push('B: ' + String(e).slice(0, 140)));
    if (!(await openPanel(B))) return { FATAL: 'B !! MODE NOT LOADED (void)' };
    log.push({ step: '2 B resumes', B: await readSurface(B) });

    /* ---- 3. Tab B changes the truth. A should be told, by name. -------- */
    await say(B, 'diagnose our churn is high and handover between teams is broken', 2800);
    await A.waitForTimeout(1600);
    log.push({
      step: '3 B writes -> A notified',
      B: await readSurface(B),
      A_notice: (await readSurface(A)).notice,
      A_title: await whichProject(A),
    });

    /* ---- 4. Tab A writes back. B should be told. ----------------------- */
    await say(A, 'diagnose our margin is thin and automation is missing everywhere', 2800);
    await B.waitForTimeout(1600);
    log.push({
      step: '4 A writes -> B notified',
      A: await readSurface(A),
      B_notice: (await readSurface(B)).notice,
    });

    /* ---- 5. Who actually won on disk? --------------------------------- */
    const onDisk = await A.evaluate(async () => {
      const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
      if (!raw) return { NOTHING_STORED: true };
      const idx = JSON.parse(raw);
      const id = idx.last;
      const db = await new Promise((res) => {
        const r = indexedDB.open('hi-anzy-lab', 1);
        r.onsuccess = () => res(r.result);
      });
      const rec = await new Promise((res) => {
        const q = db.transaction('projects', 'readonly').objectStore('projects').get(id);
        q.onsuccess = () => res(q.result);
      });
      db.close();
      return {
        rows: idx.projects.length,
        last: id,
        statement: rec?.statement ?? null,
        historyKinds: (rec?.history ?? []).map((h) => h.kind).join(' > '),
      };
    });
    log.push({ step: '5 on disk after both wrote', onDisk });

    /* ---- 6. B starts a new project, then deletes the shared one ------- */
    await say(B, 'new', 1800);
    await B.waitForTimeout(600);
    const del = B.locator('.os-saved button', { hasText: /^DELETE$/ }).first();
    const delCount = await del.count();
    if (delCount) {
      await del.click();
      await B.waitForTimeout(400);
      const confirm = B.locator('.os-saved button', { hasText: 'DELETE FOR GOOD' }).first();
      const needsSecondPress = (await confirm.count()) > 0;
      if (needsSecondPress) {
        await confirm.click();
        await B.waitForTimeout(1600);
      }
      await A.waitForTimeout(1600);
      log.push({
        step: '6 B deletes the project A still has open',
        needsSecondPress,
        B: await readSurface(B),
        A_notice: (await readSurface(A)).notice,
        A_stillHasItOnScreen: await whichProject(A),
      });
    } else {
      log.push({ step: '6 delete', skipped: 'no DELETE button — project not listed as another' });
    }

    /* ---- 7. A saves again: does the deleted project come back? -------- */
    await say(A, 'diagnose our traffic is fine but brand is inconsistent', 2800);
    await A.waitForTimeout(1200);
    const afterResave = await A.evaluate(() => {
      const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
      if (!raw) return { NOTHING_STORED: true };
      const idx = JSON.parse(raw);
      return { rows: idx.projects.length, last: idx.last, excerpts: idx.projects.map((p) => (p.excerpt || '').slice(0, 44)) };
    });
    log.push({ step: '7 A re-saves after deletion', afterResave, A: await readSurface(A) });
  } catch (e) {
    log.push({ THREW: String(e).slice(0, 300) });
  }

  await ctx.close();
  return { log, errors };
}
