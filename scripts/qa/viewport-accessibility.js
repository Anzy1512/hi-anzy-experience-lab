/*
 * FLOW D completed through the shell's own brief bar, then the four-viewport
 * pass over the surfaces this phase touched, then reduced motion.
 *
 * Overflow and target sizes are measured, not eyeballed. The 32px floor is
 * this project's own baseline; WCAG 2.5.8 AA is 24px, and anything between is
 * reported rather than silently passed.
 */
async (page) => {
  const BASE = 'http://localhost:5173';
  const out = [];

  const fresh = async (opts = {}) => {
    const ctx = await page.context().browser().newContext(opts);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
    const warn = [];
    p.on('console', (m) => {
      if (m.type() === 'error' || /did not report ready/.test(m.text())) warn.push(m.text().slice(0, 130));
    });
    return { ctx, p, errs, warn };
  };

  const go = async (p, id, ms = 3400) => {
    await p.goto(`${BASE}/#/${id}`);
    await p.waitForTimeout(ms);
    return p.evaluate(() => !!document.querySelector('.modehost__chrome'));
  };

  const say = async (p, cmd, ms = 2400) => {
    const t = p.locator('.os-cmd__input').first();
    try {
      await t.waitFor({ state: 'visible', timeout: 8000 });
    } catch {
      return 'NO TERMINAL';
    }
    await t.click();
    await t.fill(cmd);
    await p.keyboard.press('Enter');
    await p.waitForTimeout(ms);
    return 'ok';
  };

  const bar = (p, label) =>
    p.locator('.artifact').filter({ has: p.locator('.artifact__label', { hasText: label }) });

  const stored = (p) =>
    p.evaluate(async () => {
      const raw = localStorage.getItem('hi-anzy-lab.projects.v1');
      if (!raw) return { NOTHING_STORED: true };
      const idx = JSON.parse(raw);
      const db = await new Promise((r) => {
        const q = indexedDB.open('hi-anzy-lab', 1);
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
      });
      if (!db) return { NO_DB: true };
      const rec = await new Promise((r) => {
        const q = db.transaction('projects', 'readonly').objectStore('projects').get(idx.last);
        q.onsuccess = () => r(q.result);
        q.onerror = () => r(null);
      });
      db.close();
      return {
        artifacts: (rec?.artifacts ?? []).map((a) => `${a.kind}:${(a.title || '').slice(0, 26)}`),
        history: [...new Set((rec?.history ?? []).map((h) => h.kind))].join(','),
      };
    });

  /* ================= FLOW D, completed ================================= */
  {
    const { ctx, p, errs, warn } = await fresh();
    const step = [];
    await go(p, 'anzy-os');
    await say(p, 'diagnose our margin is thin, churn is high and automation is missing', 2800);
    await say(p, 'open system', 2200);
    step.push({ at: 'D1 project from the terminal', stored: await stored(p) });

    const brief = bar(p, 'THE BRIEF');
    const has = await brief.count();
    let made = false;
    if (has) {
      const send = brief.locator('.artifact__btn--send').first();
      const dlBtn = brief.locator('.artifact__btn', { hasText: /DOWNLOAD \.MD/ }).first();
      if (await send.count()) {
        await send.click();
        made = 'sent';
      } else if (await dlBtn.count()) {
        const dl = p.waitForEvent('download', { timeout: 9000 }).catch(() => null);
        await dlBtn.click();
        await dl;
        made = 'downloaded';
      }
      await p.waitForTimeout(2800);
    }
    step.push({ at: 'D2 product -> artifact', briefBarPresent: has > 0, made, stored: await stored(p) });

    await p.reload();
    await p.waitForTimeout(3600);
    await say(p, 'open system', 2200);
    step.push({
      at: 'D3 reload -> SYSTEM.app',
      kv: await p.evaluate(() => [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | ')),
      title: await p.evaluate(() => document.querySelector('.os-prj__title')?.textContent?.trim()),
      stored: await stored(p),
    });
    out.push({ FLOW: 'D', step, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  /* ================= FOUR VIEWPORTS ==================================== */
  const SIZES = [
    { w: 1920, h: 1080 },
    { w: 1440, h: 900 },
    { w: 768, h: 1024 },
    { w: 390, h: 844 },
  ];
  const SURFACES = ['anzy-os', 'agency-simulator', 'reality-compiler', 'x-ray', 'director', 'portal', 'matter-engine'];

  for (const size of SIZES) {
    const { ctx, p, errs, warn } = await fresh({ viewport: { width: size.w, height: size.h } });
    const rows = [];
    /* Give the project surface something to show at every size. */
    await go(p, 'anzy-os');
    await say(p, 'diagnose our conversion is weak and reporting is a mess', 2600);
    await say(p, 'open system', 2000);

    for (const id of SURFACES) {
      if (id !== 'anzy-os') await go(p, id, 3600);
      else await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const doc = document.documentElement;
        /* Anything painted and interactive, measured. */
        const targets = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')]
          .filter((el) => {
            const b = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
          })
          .map((el) => ({
            h: Math.round(el.getBoundingClientRect().height * 10) / 10,
            w: Math.round(el.getBoundingClientRect().width * 10) / 10,
            t: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 26),
          }));
        return {
          hScroll: doc.scrollWidth > doc.clientWidth + 1,
          overflowPx: doc.scrollWidth - doc.clientWidth,
          under24: targets.filter((t) => t.h < 24).map((t) => `${t.t}@${t.h}`),
          from24to32: targets.filter((t) => t.h >= 24 && t.h < 32).map((t) => `${t.t}@${t.h}`),
          targetCount: targets.length,
          exitH: (() => {
            const e = document.querySelector('.modehost__exit');
            return e ? Math.round(e.getBoundingClientRect().height * 10) / 10 : null;
          })(),
        };
      });
      rows.push({ id, ...r });
    }

    /* The project surface itself, at this size. */
    await go(p, 'anzy-os');
    await say(p, 'open system', 2000);
    const projectSurface = await p.evaluate(() => {
      const panel = document.querySelector('.os-prj, .os-sheet, [class*="os-prj"]');
      const ctrls = [...document.querySelectorAll('.os-prj__danger-row button, .os-saved button, .artifact__btn')].map((b) => ({
        t: b.textContent.trim().slice(0, 24),
        h: Math.round(b.getBoundingClientRect().height * 10) / 10,
      }));
      return {
        panelVisible: !!panel,
        kv: [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | '),
        where: document.querySelector('.os-prj__where')?.textContent?.trim().slice(0, 80) ?? null,
        controls: ctrls,
        controlsUnder32: ctrls.filter((c) => c.h < 32).map((c) => `${c.t}@${c.h}`),
      };
    });

    out.push({ VIEWPORT: `${size.w}x${size.h}`, rows, projectSurface, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  /* ================= REDUCED MOTION =================================== */
  {
    const { ctx, p, errs, warn } = await fresh({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
    await go(p, 'anzy-os');
    await say(p, 'diagnose our conversion is weak and reporting is a mess', 2600);
    await say(p, 'open system', 2200);
    const rm = await p.evaluate(() => ({
      /* The concept must survive: the panel and its information are present. */
      panel: !!document.querySelector('.os-prj__kv'),
      kv: [...document.querySelectorAll('.os-prj__kv div')].map((d) => d.textContent.trim()).join(' | '),
      where: document.querySelector('.os-prj__where')?.textContent?.trim().slice(0, 70) ?? null,
      sections: document.querySelectorAll('.os-read, .os-sec, .artifact').length,
      /* And nothing should still be travelling. */
      animating: [...document.querySelectorAll('.os-prj, .os-prj *, .artifact, .artifact *')]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return cs.animationName !== 'none' && cs.animationDuration !== '0s';
        })
        .length,
    }));
    const esc = await (async () => {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(1500);
      return { hash: p.url().split('#')[1] ?? '', modehosts: await p.evaluate(() => document.querySelectorAll('.modehost').length) };
    })();
    out.push({ REDUCED_MOTION: rm, escapeLeaves: esc, pageErrors: errs, warnings: warn });
    await ctx.close();
  }

  return out;
}
