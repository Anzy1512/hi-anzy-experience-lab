import { useCallback, useRef, useState } from 'react';
import { useScopedEffect } from '../core/useScope';
import type { Artifact, ArtifactFormat, ArtifactResult } from './artifact';
import { runFormat } from './artifact';
import './artifact.css';

/**
 * THE ARTIFACT BAR — the one control strip that ends a tool.
 *
 * A tool declares the formats that mean something for it and supplies the
 * artifact lazily; nothing is composed until a button is pressed, so a brief
 * that is still being assembled costs nothing to offer.
 *
 * ── IT REPORTS, IT DOES NOT REASSURE ────────────────────────────────────────
 *
 * Every button resolves to a sentence the visitor can act on. A copy that was
 * refused says so and tells them to select the text instead; a frame that
 * cannot be read back says that rather than producing a blank PNG. The failure
 * states are the reason this is a component at all rather than six onClick
 * handlers — they are the part that would have been skipped six times.
 *
 * The message clears itself, and that timer is the only thing here with a
 * lifetime, so it is registered on a scope like everything else in the Lab.
 */

const LABELS: Record<ArtifactFormat, string> = {
  copy: 'COPY',
  markdown: 'DOWNLOAD .MD',
  json: 'DOWNLOAD .JSON',
  image: 'DOWNLOAD .PNG',
};

const DONE: Record<ArtifactFormat, string> = {
  copy: 'COPIED',
  markdown: 'SAVED .MD',
  json: 'SAVED .JSON',
  image: 'SAVED .PNG',
};

export interface ArtifactBarProps {
  formats: readonly ArtifactFormat[];
  /** Resolved at click time. See `Artifact.canvas` for why nothing is held. */
  build: () => Artifact;
  /** Optional trailing control — RESET, SEND TO…, anything tool-specific. */
  children?: React.ReactNode;
  /** Disables every format, for a tool whose result is not ready yet. */
  disabled?: boolean;
  label?: string;
}

export function ArtifactBar({
  formats,
  build,
  children,
  disabled = false,
  label = 'TAKE THIS WITH YOU',
}: ArtifactBarProps) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const timerRef = useRef(0);

  /*
   * The message's clear-out is the only thing here with a lifetime. It is held
   * as an id rather than registered per-click because each press must cancel
   * the previous press's timer: without that, two clicks in quick succession
   * leave the first one's clear-out to wipe the second one's result off the
   * screen a moment after it appears. The scope owns the pending id, so an
   * unmount mid-message cannot set state on a component that is gone.
   */
  useScopedEffect(
    (scope) => {
      scope.add(() => window.clearTimeout(timerRef.current));
    },
    [],
    'artifact-bar',
  );

  const run = useCallback(
    async (format: ArtifactFormat) => {
      const result: ArtifactResult = await runFormat(format, build());
      setMsg(
        result.ok ? { text: DONE[format], ok: true } : { text: result.reason, ok: false },
      );
      window.clearTimeout(timerRef.current);
      /*
       * A failure stays up four times as long as a success. "COPIED" is a
       * receipt and the visitor already knows what they did; "COPY REFUSED —
       * SELECT AND COPY MANUALLY" is an instruction, and an instruction that
       * disappears before it can be read is worse than none.
       */
      timerRef.current = window.setTimeout(() => setMsg(null), result.ok ? 2000 : 8000);
    },
    [build],
  );

  return (
    <div className="artifact">
      <p className="t-mono t-mono-xs artifact__label">{label}</p>
      <div className="artifact__row">
        {formats.map((f) => (
          <button
            key={f}
            type="button"
            className="t-mono t-mono-xs artifact__btn"
            onClick={() => void run(f)}
            disabled={disabled}
          >
            {LABELS[f]}
          </button>
        ))}
        {children}
      </div>
      {/*
        `role="status"` rather than an alert: these are confirmations of
        something the visitor just did on purpose, and an assertive live region
        would interrupt a screen reader mid-sentence to say COPIED. Always in
        the DOM so the region is not announced as it appears.
      */}
      <p
        className="t-mono t-mono-xs artifact__msg"
        role="status"
        data-state={msg ? (msg.ok ? 'ok' : 'fail') : 'idle'}
      >
        {msg?.text ?? ''}
      </p>
    </div>
  );
}
