/**
 * MATTER ENGINE COPY.
 *
 * Kept apart from the mode for the same reason every other reality's copy is:
 * a string a visitor reads is content, and content does not live inside a
 * render function. Nothing here asserts a client, a result or a metric.
 */
export const MATTER_COPY = {
  /** The instrument's one input. Named as an instruction, not as a field. */
  typeLabel: 'SET THE MATTER IN YOUR OWN WORDS',
  typeSet: 'FORM',
  typeReset: 'BACK TO THE WORDMARK',

  /* Status lines. These are the only account a screen reader gets of a change
     that otherwise happens entirely in WebGL, so they state what was set
     rather than that something happened. */
  typeReady: 'The matter is set in the wordmark. Type a phrase to re-form it.',
  typeSetPrefix: 'Re-formed. The matter now reads:',
  typeRestored: 'Re-formed. The matter reads HI ANZY again.',
  /* Not "invalid input": the visitor did nothing wrong, the face simply has no
     outline for what they typed, and saying so is more useful than refusing. */
  typeUnsupported:
    'Nothing in that phrase has a letterform in this typeface, so there is nothing for the matter to become. Try letters or numbers.',

  /** Replaces the fixed TYPE note once the matter is setting the visitor's own. */
  typedNote: 'Your phrase, sampled from the same glyphs the wordmark is sampled from.',
} as const;
