import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

/**
 * ONE easing vocabulary, shared by CSS and GSAP.
 *
 * The five curves below are registered with CustomEase using the *same*
 * cubic-bezier control points as the `--e-*` tokens in tokens.css, so a
 * transition written in CSS and a tween written in JS move identically. Without
 * this the product develops two different senses of weight and starts to feel
 * assembled rather than designed.
 *
 * Nothing in this app uses "ease-in-out" or GSAP's default "power1.out".
 */

let registered = false;

export function registerEases(): void {
  if (registered) return;
  gsap.registerPlugin(CustomEase);

  // SNAP — leaves immediately, arrives hard. State changes, toggles, selection.
  CustomEase.create('snap', 'M0,0 C0.2,0.9 0.1,1 1,1');
  // GLIDE — long tail. Things that travel across the sheet.
  CustomEase.create('glide', 'M0,0 C0.25,1 0.3,1 1,1');
  // WEIGHT — reluctant start, committed finish. Material and mass.
  CustomEase.create('weight', 'M0,0 C0.62,0.02 0.2,1 1,1');
  // MECHANICAL — held, then decisive. Instrument parts. Registration.
  CustomEase.create('mechanical', 'M0,0 C0.9,0 0.1,1 1,1');
  // CINEMATIC — the slowest settle. Reserved for whole-material changes.
  CustomEase.create('cinematic', 'M0,0 C0.16,1 0.3,1 1,1');

  registered = true;
}

export const EASE = {
  snap: 'snap',
  glide: 'glide',
  weight: 'weight',
  mechanical: 'mechanical',
  cinematic: 'cinematic',
} as const;

/** Seconds, matching the --d-* tokens. */
export const DUR = {
  d1: 0.12,
  d2: 0.24,
  d3: 0.42,
  d4: 0.7,
  d5: 1.2,
  d6: 2.0,
} as const;
