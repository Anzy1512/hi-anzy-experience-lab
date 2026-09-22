/*
 * MODE ENTRY / EXIT / RE-ENTRY, and the re-entry defect specifically.
 *
 * Phase is read from `.modehost[data-phase]`, which the mode host publishes.
 * Lifecycle counts come from the dev instruments the project already ships
 * (`__labPerf`, `__labCam`, `__labAudio`), so nothing here is invented.
 */
async (page) => {
  const BASE = 'http://localhost:5173';
  const out = [];

  const fresh = async () => {
    const ctx = await page.context().browser().newContext();
    const p = await ctx.newPage();
    const c = [];
    p.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') c.push(m.type() + ': ' + m.text().slice(0, 140));
    });
    const e = [];
    p.on('pageerror', (x) => e.push(String(x).slice(0, 160)));
    return { ctx, p, c, e };
  };

  const phase = (p) => p.evaluate(() => document.querySelector('.modehost')?.getAttribute('data-phase') ?? null);

  const watch = async (p, secs) => {
    const t0 = Date.now();
    const s = [];
    for (let i = 0; i < secs * 5; i++) {
      s.push({
        t: Date.now() - t0,
        ...(await p.evaluate(() => {
          const mh = document.querySelector('.modehost');
          return { phase: mh?.getAttribute('data-phase') ?? null, mode: mh?.getAttribute('data-mode') ?? null, hash: location.hash };
        })),
      });
      await p.waitForTimeout(200);
    }
    return s.filter((x, i) => i === 0 || x.phase !== s[i - 1].phase || x.hash !== s[i - 1].hash);
  };

  /* The project's own instruments, not a guess at what is running. */
  const vitals = (p) =>
    p.evaluate(async () => {
      const perf = window.__labPerf ? await window.__labPerf.sample(300) : null;
      return {
        rafSubscribers: perf?.rafSubscribers ?? 'UNKNOWN',
        canvases: document.querySelectorAll('canvas').length,
        videos: document.querySelectorAll('video').length,
        cam: window.__labCam ? window.__labCam.report() : 'UNKNOWN',
        audio: window.__labAudio ? window.__labAudio.report() : 'UNKNOWN',
        modehosts: document.querySelectorAll('.modehost').length,
      };
    });

  /* ===== 1. THE DEFECT: re-entering the reality already open ============ */
  {
    const { ctx, p, c, e } = await fresh();
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2600);
    const before = await phase(p);
    await p.goto(`${BASE}/#/anzy-os`); // same url — the exact repro
    const samples = await watch(p, 11);
    out.push({
      case: '1 re-enter the reality already open (11s)',
      phaseBefore: before,
      samples,
      stillMountedAfter11s: await phase(p),
      console: c,
      pageErrors: e,
    });
    await ctx.close();
  }

  /* ===== 2. The same thing through the app's own door =================== */
  {
    const { ctx, p, c, e } = await fresh();
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2600);
    /* Drive enterMode with the id already active, the way a door pointing at
       the current reality would. */
    const hadBefore = await p.evaluate(() => history.length);
    await p.evaluate(() => {
      history.pushState(null, '', '#/anzy-os');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const samples = await watch(p, 10);
    out.push({
      case: '2 popstate onto the same reality (10s)',
      samples,
      phaseAfter: await phase(p),
      historyBefore: hadBefore,
      console: c,
      pageErrors: e,
    });
    await ctx.close();
  }

  /* ===== 3. A mode still works after a same-id re-entry ================= */
  {
    const { ctx, p, c, e } = await fresh();
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2600);
    await p.goto(`${BASE}/#/anzy-os`);
    await p.waitForTimeout(2000);
    /* The scope must still be live: if it had been disposed under the mounted
       mode, everything registered after would be cancelled as it was made. */
    const t = p.locator('.os-cmd__input').first();
    let terminalWorks = false;
    if (await t.count()) {
      await t.click();
      await t.fill('diagnose our conversion is weak and reporting is a mess');
      await p.keyboard.press('Enter');
      await p.waitForTimeout(2400);
      terminalWorks = await p.evaluate(() => /PROBLEM FRAME/i.test(document.body.innerText));
    }
    const clockTicks = await p.evaluate(async () => {
      const read = () => document.body.innerText.match(/\b\d{2}:\d{2}:\d{2}\b/)?.[0] ?? null;
      const a = read();
      await new Promise((r) => setTimeout(r, 1600));
      return { a, b: read() };
    });
    out.push({
      case: '3 mode still live after same-id re-entry',
      phase: await phase(p),
      terminalWorks,
      clockTicks,
      clockAdvanced: clockTicks.a !== null && clockTicks.a !== clockTicks.b,
      console: c,
      pageErrors: e,
    });
    await ctx.close();
  }

  /* ===== 4. enter -> exit -> re-enter -> Escape, and the leak counts ==== */
  {
    const { ctx, p, c, e } = await fresh();
    await p.goto(`${BASE}/#index`);
    await p.waitForTimeout(1800);
    const atIndex = await vitals(p);

    const cycle = [];
    for (const id of ['matter-engine', 'anzy-os', 'matter-engine']) {
      await p.goto(`${BASE}/#/${id}`);
      await p.waitForTimeout(3200);
      const inMode = { id, phase: await phase(p), ...(await vitals(p)) };
      /* Leave by Escape — the contract says it always works. */
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1600);
      cycle.push({ ...inMode, afterEscape: { hash: p.url().split('#')[1] ?? '', ...(await vitals(p)) } });
    }
    out.push({ case: '4 enter/exit/re-enter + Escape', atIndex, cycle, console: c, pageErrors: e });
    await ctx.close();
  }

  return out;
}
