/**
 * WHAT THE LAB IS WILLING TO SAY ABOUT A VISIT.
 *
 * A typed vocabulary of twelve moments, and a sink that is empty by default.
 *
 * ── THIS FILE SENDS NOTHING ─────────────────────────────────────────────────
 *
 * There is no endpoint, no beacon, no script tag, no queue that drains on
 * unload. `emit()` hands the event to whatever `onEvent` has been registered,
 * and if nothing has been, it returns. That is the whole implementation.
 *
 * It exists so that when somebody does connect an analytics product, the shape
 * of what the Lab reports is already decided — by the people who built it,
 * reading this file — rather than decided in a hurry by whoever is holding the
 * vendor snippet. The names below are the complete list. Adding a thirteenth
 * should feel like a decision.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 *
 * No identifier of any kind: no visitor id, session id, device id or hash of
 * one. No user agent, screen size, timezone, language or capability profile —
 * the Lab detects capability to decide what to render, and that reading stays
 * inside the render. No pointer coordinates, no scroll depth, no dwell
 * sampling, no session replay, no error payloads containing page content.
 *
 * An event is a name, an optional reality id, and nothing else. Two visitors
 * who walk the same path emit identical streams, which is the property that
 * makes this safe: there is nothing in here to join on.
 *
 * `PERFORMANCE` reports `STORAGE — NONE`. Nothing in this file may change that.
 */

export type LabEvent =
  /** The Lab was opened from somewhere. */
  | 'lab_open'
  /** The Lab was left for the commercial site. */
  | 'lab_exit'
  | 'reality_enter'
  | 'reality_exit'
  /** An onward move offered by the reality graph was taken. */
  | 'recommended_next_click'
  /** The Index door: show me everything. */
  | 'free_explore'
  | 'curated_path_start'
  | 'curated_path_complete'
  /** The curated path was abandoned for free exploration. */
  | 'curated_path_leave'
  /** The restrained return surface was shown. */
  | 'commercial_return'
  /** A route back into the business was taken. */
  | 'contact_after_lab';

export interface LabEventPayload {
  /** A reality id, where the event is about one. Never anything else. */
  reality?: string;
}

type Sink = (name: LabEvent, payload: LabEventPayload) => void;

let sink: Sink | null = null;

/**
 * Register the one consumer. Passing `null` disconnects it again.
 *
 * Deliberately single-slot rather than a listener set: a list of subscribers is
 * how a page ends up reporting to four vendors because nobody could see the
 * whole set in one place.
 */
export function onEvent(fn: Sink | null): void {
  sink = fn;
}

export function emit(name: LabEvent, payload: LabEventPayload = {}): void {
  if (!sink) return;
  try {
    sink(name, payload);
  } catch {
    /* A reporting failure must never be a visitor-facing one. */
  }
}

/** Development only: prints the stream so the vocabulary can be read as it runs. */
if (import.meta.env.DEV) {
  (window as unknown as { __labEvents?: unknown }).__labEvents = {
    trace() {
      onEvent((name, payload) => console.info('[lab:event]', name, payload));
      return 'tracing — onEvent(null) to stop';
    },
    stop() {
      onEvent(null);
      return 'stopped';
    },
  };
}
