import { useCallback, useRef, useState } from 'react';
import { useScopedEffect } from '../core/useScope';
import { useExperience } from '../experience/context';
import { findMode } from '../content/lab';
import { recordArtifact, type ArtifactKind, type ArtifactRecord } from '../system/project';
import { offer } from '../system/handoff';
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

/*
 * DOWNLOADED, not SAVED.
 *
 * This product uses SAVED for one specific thing — a project written into this
 * browser's storage, which SYSTEM.app reports as "SAVED — YES · IN THIS
 * BROWSER". A download writes a file to the visitor's machine and puts nothing
 * in the project ledger, so answering it with the same word said the opposite
 * of what had happened. One verb, one class of action.
 */
const DONE: Record<ArtifactFormat, string> = {
  copy: 'COPIED',
  markdown: 'DOWNLOADED .MD',
  json: 'DOWNLOADED .JSON',
  image: 'DOWNLOADED .PNG',
};

/**
 * CONTINUE, as a declaration rather than as six hand-written buttons.
 *
 * The sixth question a product has to answer is "where can this go next", and
 * before Phase 8.7 exactly one tool answered it — the Simulator, by calling the
 * brief store's setter directly. Five more tools doing that would be five tools
 * reaching into each other's state.
 *
 * So a tool declares a destination here, and the bar does the rest: compose the
 * artifact, put it in the project store, offer it to the destination, and go
 * there. What crosses is an id. The receiving tool looks it up and decides for
 * itself, and can decline without anything having been mutated.
 */
export interface ArtifactHandoff {
  kind: ArtifactKind;
  /** Mode id producing this. */
  from: string;
  /** Mode id it is offered to. */
  to: string;
  /**
   * What this artifact cannot tell you. Required, not optional.
   *
   * An artifact travels — somebody forwards the Markdown and the screen that
   * qualified it is long gone. The type makes the limits a compile error to
   * omit rather than a review comment to remember.
   */
  limits: string;
  /** Artifacts this was derived from, for a checkable lineage. */
  sourceIds?: string[];
  /**
   * Run after the artifact is recorded and before the visitor is moved.
   *
   * For a tool that also keeps live working state a receiving surface renders —
   * the Simulator writes the run into `system/brief`, which is what SYSTEM.app
   * has drawn since Phase 8.6. The record and the live state are different
   * things: one is a dated document in the project, the other is what the
   * environment is currently showing. Keeping both in step is the producing
   * tool's business, so it is a callback rather than something this bar guesses.
   */
  onSend?: (record: ArtifactRecord) => void;
}

export interface ArtifactBarProps {
  formats: readonly ArtifactFormat[];
  /** Resolved at click time. See `Artifact.canvas` for why nothing is held. */
  build: () => Artifact;
  /** Where this result can go next. Omit when nothing can receive it yet. */
  handoff?: ArtifactHandoff;
  /** Optional trailing control — RESET, anything tool-specific. */
  children?: React.ReactNode;
  /** Disables every format, for a tool whose result is not ready yet. */
  disabled?: boolean;
  label?: string;
}

export function ArtifactBar({
  formats,
  build,
  handoff,
  children,
  disabled = false,
  label = 'TAKE THIS WITH YOU',
}: ArtifactBarProps) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const timerRef = useRef(0);
  const { enterMode } = useExperience();

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

  /**
   * Send the result onward.
   *
   * Composes the artifact once, records it against the current project, offers
   * it, and navigates. The artifact is recorded BEFORE the offer because an
   * offer carries an id and an id has to exist — and it is recorded even on the
   * failure path below, so a visitor who lands somewhere unexpected still has
   * the thing in the project store rather than having lost it.
   *
   * Images are not carried. A PNG is handed to the browser's download path and
   * never retained, so a recipe travels and the picture does not; the record's
   * own `limits` line is where a producer says so.
   */
  const send = useCallback(() => {
    if (!handoff) return;
    const artifact = build();
    const record = recordArtifact({
      kind: handoff.kind,
      title: artifact.name,
      producer: handoff.from,
      sourceIds: handoff.sourceIds ?? [],
      limits: handoff.limits,
      text: artifact.text,
      data: artifact.data,
    });
    if (!offer(record.id, handoff.from, handoff.to)) {
      setMsg({ text: 'COULD NOT SEND — THE RESULT WAS NOT RECORDED', ok: false });
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setMsg(null), 8000);
      return;
    }
    handoff.onSend?.(record);
    enterMode(handoff.to);
  }, [build, enterMode, handoff]);

  /* The destination's own title, so the control names a place rather than an
     id. Falls back to the id, which is still better than a generic "SEND". */
  const destination = handoff ? (findMode(handoff.to)?.title ?? handoff.to) : null;

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
        {/*
          CONTINUE sits after the formats and is marked as signal, because it is
          the only control here that moves the visitor somewhere. Taking a copy
          is an ending; sending it on is the product working.
        */}
        {handoff && (
          <button
            type="button"
            className="t-mono t-mono-xs artifact__btn artifact__btn--send"
            onClick={send}
            disabled={disabled}
          >
            SEND TO {destination}
          </button>
        )}
        {children}
      </div>

      {/*
        THE DIFFERENCE BETWEEN THESE CONTROLS, SAID OUT LOUD.

        A download and a send sit in one row as equal siblings, and they do not
        do the same thing: the copy is a file on your machine and nothing else,
        while sending composes the result, records it against the project with
        its provenance and its limits, and then carries it. Only one of them
        leaves a trace in WHAT WAS MADE.

        The code comment above has said this since Phase 8.8 — "taking a copy
        is an ending; sending it on is the product working" — to developers
        only. A visitor had no way to know which control kept their result,
        which made the ledger look arbitrary the first time something they had
        downloaded was not in it.

        Shown only when there is actually a send to contrast against.
      */}
      {handoff && (
        <p className="t-body-s t-dim artifact__note">
          A copy leaves with you and nothing is kept.{' '}
          <span className="t-mono t-mono-xs">SEND</span> also records it in this project, with
          where it came from and what it cannot tell you.
        </p>
      )}

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
