/*
 * PHASE 8.12C — PASS I. Behaviour regression after the release contract and
 * the canonical content re-sync.
 *
 * What could plausibly have broken:
 *   the three dev guards (registry / maturity / release) now that one of them
 *   is new and one manifest changed; every reality still entering; the
 *   same-reality navigation fix; lifecycle returning to zero; Escape; the
 *   orientation sheet, which prints the registry contract that was edited.
 */
async (page) => {
  const BASE = 'http://localhost:5173';
  const out = {};

  const IDS = [
    'living-world', 'reality-compiler', 'matter-engine', 'agency-simulator',
    'presence', 'memory', 'anzy-os', 'portal', 'x-ray', 'director',
    'chaos', 'dream', 'after-dark', 'sonic-architecture', 'time-machine', 'performance',
    'intelligence',
  ];

  const fresh = async (opts = {}) => {
    const ctx = await page.context().browser().newContext({
      viewport: { width: 1440, height: 900 },
      ...opts,
    });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
    const cons = [];
    p.on('console', (m) => {
      if (m.type() === 'error' || /did not report ready/.test(m.text())) cons.push(m.text().slice(0, 200));
    });
    return { ctx, p, errs, cons };
  };

  /* ---- 1. The three dev guards must all be silent -------------------- */
  {
    const { ctx, p, errs, cons } = await fresh();
    await p.goto(BASE + '/#index');
    await p.waitForTimeout(3200);
    out.guards = {
      registry: cons.filter((c) => c.indexOf('[registry]') > -1),
      maturity: cons.filter((c) => c.indexOf('[maturity]') > -1),
      release: cons.filter((c) => c.indexOf('[release]') > -1),
      other: cons.filter((c) => !/\[registry\]|\[maturity\]|\[release\]/.test(c)),
      pageErrors: errs,
    };
    await ctx.close();
  }

  /* ---- 2. Every reality still enters, with no overflow ---------------- */
  {
    const { ctx, p, errs, cons } = await fresh();
    const rows = [];
    for (const id of IDS) {
      await p.goto(BASE + '/#/' + id);
      await p.waitForTimeout(id === 'living-world' ? 5200 : 3400);
      rows.push({
        id,
        ...(await p.evaluate(() => ({
          phase: document.querySelector('.modehost') ? document.querySelector('.modehost').getAttribute('data-phase') : null,
          chrome: !!document.querySelector('.modehost__chrome'),
          overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }))),
      });
    }
    out.enterable = {
      all: rows.every((r) => r.phase === 'active' && r.chrome && r.overflowPx === 0),
      notActive: rows.filter((r) => r.phase !== 'active').map((r) => r.id + ':' + r.phase),
      overflow: rows.filter((r) => r.overflowPx !== 0).map((r) => r.id + ':' + r.overflowPx),
      pageErrors: errs,
      consoleErrors: cons,
    };
    await ctx.close();
  }

  /* ---- 3. Same-reality navigation must not restart the room ----------- */
  {
    const { ctx, p, cons } = await fresh();
    await p.goto(BASE + '/#/agency-simulator');
    await p.waitForTimeout(3400);
    const before = await p.evaluate(() => document.querySelector('.modehost').getAttribute('data-phase'));
    await p.evaluate(() => { window.location.hash = '#/agency-simulator'; });
    await p.waitForTimeout(1600);
    const after = await p.evaluate(() => document.querySelector('.modehost').getAttribute('data-phase'));
    out.sameRealityNav = {
      before, after, stayedActive: before === 'active' && after === 'active',
      watchdogFired: cons.filter((c) => /did not report ready/.test(c)),
    };
    await ctx.close();
  }

  /*
   * ---- 4. Lifecycle: enter -> exit -> enter -> exit, back to zero -----
   *
   * READ THIS BEFORE INVESTIGATING `presence: canvases 1`.
   *
   * It is not a leak and it was checked. The remaining canvas sits at
   * MAIN.index > SECTION.index__graph > DIV.index__lattice > CANVAS — the
   * Reality Index's own lattice, which is what the app returns to. Presence's
   * own DIV.pr-canvas is gone and `hosts` is 0. Matter and the OS read 0 here
   * only because the lattice had not mounted yet when they were probed; give
   * them four more seconds and they read 1 as well.
   *
   * What this probe is really for is `hosts`, `videos`, and a mode canvas
   * OUTSIDE .index__lattice. Those must be zero.
   */
  {
    const { ctx, p, errs } = await fresh();
    const probe = () => p.evaluate(() => ({
      raf: window.__labPerf ? window.__labPerf.sample(0).rafSubscribers : null,
      canvases: document.querySelectorAll('canvas').length,
      videos: document.querySelectorAll('video').length,
      hosts: document.querySelectorAll('.modehost').length,
    }));
    const cycle = [];
    for (const id of ['matter-engine', 'presence', 'anzy-os']) {
      for (let i = 0; i < 2; i++) {
        await p.goto(BASE + '/#/' + id);
        await p.waitForTimeout(3200);
        await p.keyboard.press('Escape');
        await p.waitForTimeout(2000);
      }
      cycle.push({ id, after: await probe() });
    }
    out.lifecycle = { cycle, pageErrors: errs };
    await ctx.close();
  }

  /* ---- 5. The orientation sheet, which prints the edited contract ----- */
  {
    const { ctx, p, errs } = await fresh();
    const seen = {};
    for (const id of ['x-ray', 'performance', 'agency-simulator', 'presence']) {
      await p.goto(BASE + '/#/' + id);
      await p.waitForTimeout(3400);
      const t = p.locator('.modehost__id').first();
      const opened = (await t.count()) > 0;
      if (opened) { await t.click(); await p.waitForTimeout(800); }
      seen[id] = await p.evaluate(() => {
        const rows = [...document.querySelectorAll('.pc__row')];
        const grab = (k) => {
          const r = rows.find((x) => x.querySelector('.pc__k') && x.querySelector('.pc__k').textContent.trim() === k);
          return r && r.querySelector('.pc__v') ? r.querySelector('.pc__v').textContent.trim().slice(0, 130) : null;
        };
        const o = document.querySelector('.ori');
        return {
          sheetOpen: !!o,
          CONTINUE: grab('CONTINUE'),
          RESULT: grab('RESULT'),
          keys: rows.map((r) => r.querySelector('.pc__k') ? r.querySelector('.pc__k').textContent.trim() : '').filter(Boolean),
        };
      });
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
      seen[id].escapeClosedSheet = await p.evaluate(() => !document.querySelector('.ori'));
      seen[id].stillInMode = await p.evaluate(() => {
        const h = document.querySelector('.modehost');
        return h ? h.getAttribute('data-phase') : null;
      });
    }
    out.orientation = { seen, pageErrors: errs };
    await ctx.close();
  }

  return out;
}
