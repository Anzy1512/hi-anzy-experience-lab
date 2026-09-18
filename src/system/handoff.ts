/**
 * HANDOFF — how one product sends work to another without touching it.
 *
 * ── THE RULE THIS ENFORCES ──────────────────────────────────────────────────
 *
 * Products do not mutate each other. A handoff carries two ids — an artifact
 * and the project it belongs to — and nothing else. The receiving tool looks
 * the artifact up in the store and decides for itself what to do with it, which
 * means a continuation can be inspected before it is taken, declined without
 * corrupting anything, and reasoned about without reading the sending tool's
 * component state.
 *
 * The alternative, which the Lab was one wire away from building, is every tool
 * importing every other tool's setters. That works for two tools and becomes
 * unmaintainable at six.
 *
 * ── ONE SLOT, ON PURPOSE ────────────────────────────────────────────────────
 *
 * There is a single pending handoff rather than a queue. A visitor presses SEND
 * TO SYSTEM.APP and arrives in SYSTEM.app; there is no coherent meaning for
 * three pending handoffs stacked behind that, and a queue would mostly be a way
 * for a stale offer to surface later and confuse somebody. Offering twice
 * replaces the offer, which is what pressing a button twice should do.
 *
 * The log is separate and does keep every handoff, because "how did this get
 * here" is a question the product should be able to answer.
 */

import { useSyncExternalStore } from 'react';
import { getArtifact, note, getProject, type ArtifactRecord } from './project';

export interface Handoff {
  artifactId: string;
  projectId: string;
  /** Mode id that produced the artifact. */
  from: string;
  /** Mode id this is offered to. */
  to: string;
  at: number;
}

let pending: Handoff | null = null;
const log: Handoff[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Offer an artifact to another tool.
 *
 * Returns false when the artifact is not in the store, which is a programming
 * error rather than a visitor-facing one — but it is returned rather than
 * thrown so a button handler cannot take a mode down with it.
 */
export function offer(artifactId: string, from: string, to: string): boolean {
  const artifact = getArtifact(artifactId);
  if (!artifact) return false;
  pending = { artifactId, projectId: artifact.projectId, from, to, at: Date.now() };
  log.push(pending);
  note('HANDOFF_OFFERED', `${artifact.title} carried from ${modeName(from)} to ${modeName(to)}.`, artifactId);
  emit();
  return true;
}

/**
 * Peek at what is waiting for a tool, without taking it.
 *
 * Separate from `claim` so a receiving surface can render "a brief is waiting"
 * and let the visitor decide. A continuation that consumes itself the moment
 * the destination mounts is not reversible, and reversibility is the point.
 */
export function offered(to: string): Handoff | null {
  return pending && pending.to === to ? pending : null;
}

/**
 * Take the handoff, and with it the artifact.
 *
 * Clears the pending slot: the offer has been accepted and leaving it set would
 * mean re-entering the mode later silently re-applies it.
 *
 * ── CALL THIS FROM AN EFFECT, NEVER FROM A RENDER ───────────────────────────
 *
 * Claiming is a side effect, and React is entitled to run a render — including
 * a `useState` initialiser — more than once. It does exactly that in
 * development, and X-Ray shipped with the claim in its initialiser: the first
 * invocation took the offer and cleared the slot, the second got null, and the
 * second answer is the one React kept. The instrument opened on its own
 * specimen sheet instead of on the page the Compiler had just handed it, and
 * nothing anywhere reported a failure.
 *
 * `offered()` is the pure read for deciding what to show or how to initialise.
 * This is the consuming one, and it belongs in an effect.
 */
export function claim(to: string): ArtifactRecord | null {
  if (!pending || pending.to !== to) return null;
  const artifact = getArtifact(pending.artifactId);
  const taken = pending;
  pending = null;
  /*
   * The project remembers the move, not just the slot.
   *
   * The pending slot itself is session-only and stays that way — an offer is a
   * gesture in flight, and resuming a project tomorrow to find a button still
   * waiting to be pressed from yesterday would be a stale prompt, not memory.
   * What deserves to survive is the fact that it happened.
   */
  note(
    'HANDOFF_ACCEPTED',
    `${artifact?.title ?? 'A result'} taken into ${modeName(taken.to)}.`,
    taken.artifactId,
  );
  emit();
  return artifact ?? null;
}

/** Decline without taking. The log keeps the record that it was offered. */
export function dismiss(): void {
  if (!pending) return;
  const declined = pending;
  pending = null;
  note(
    'HANDOFF_DECLINED',
    `An offer to ${modeName(declined.to)} was declined. Nothing was lost — the result stays in the project.`,
    declined.artifactId,
  );
  emit();
}

/** A mode id, as a person would say it. */
function modeName(id: string): string {
  return id.toUpperCase().replace(/-/g, ' ');
}

/**
 * Every handoff this session, oldest first.
 *
 * Read by SYSTEM.app to show how the current state was arrived at. A copy, so
 * a consumer cannot mutate the record of what happened.
 */
export function handoffLog(): Handoff[] {
  return [...log];
}

/**
 * Handoffs that belong to the project currently open.
 *
 * After NEW PROJECT the old ones are still in the log — they happened — but
 * they are not part of what is being worked on now.
 */
export function handoffsForCurrentProject(): Handoff[] {
  const { id } = getProject();
  return log.filter((h) => h.projectId === id);
}

export function subscribeHandoff(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = () => pending;

/** Watch the pending slot. Used by receiving surfaces to offer the take. */
export function usePendingHandoff(): Handoff | null {
  return useSyncExternalStore(subscribeHandoff, snapshot, snapshot);
}
