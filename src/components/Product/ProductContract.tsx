import { productOf, type ProductContract as Contract } from '../../system/registry';
import './product-contract.css';

/**
 * THE CONTRACT, PRINTED.
 *
 * Six questions a product-facing tool has to answer before it is a tool rather
 * than a demonstration of an interface:
 *
 *   INPUT      what can I give this?
 *   CONTEXT    what information is it using?
 *   PROCESS    what does it actually do?
 *   RESULT     what did it determine?
 *   ARTIFACT   what can I take away?
 *   CONTINUE   where can this go next?
 *
 * ── WHY THE GAPS ARE PRINTED TOO ────────────────────────────────────────────
 *
 * A row with no answer is still drawn, because a surface that quietly omits
 * the rows it cannot fill is how a demonstration passes for a product.
 *
 * It used to print NOT YET there. That was right in Phase 8.7, when four of
 * these rows were genuinely unbuilt and the index needed to say so out loud.
 * It is wrong now: the one product with empty rows is PRESENCE, which produces
 * nothing **by design** — the camera contract is that frames are compared and
 * discarded — and NOT YET promised a visitor a file that is never coming. A
 * deliberate absence and an unfinished one read identically in two words, so
 * the row now states the absence instead of dating it.
 *
 * The guard against the classification drifting out of step with what a mode
 * actually does is `incompleteProducts()`, which runs in development. That was
 * always the real check; the visitor-facing label was never going to be.
 *
 * ── EXPERIENCES ─────────────────────────────────────────────────────────────
 *
 * An experience is not a product with missing rows. Dream owes nobody an
 * export. So the contract table is not drawn at all for them, and the line that
 * replaces it says what the thing is instead of what it lacks.
 */

const ROWS: { key: keyof Contract; label: string }[] = [
  { key: 'input', label: 'INPUT' },
  { key: 'context', label: 'CONTEXT' },
  { key: 'process', label: 'PROCESS' },
  { key: 'result', label: 'RESULT' },
  /* Five of these six are ordinary English already. This one was the
     machinery's word for the thing, printed at the visitor. */
  { key: 'artifact', label: 'YOU TAKE' },
  { key: 'continue', label: 'CONTINUE' },
];

/*
 * What an unanswered row means, said per row rather than generically.
 *
 * Only PRESENCE reaches these today, and for it every one of them is the plain
 * truth rather than an apology: an instrument that keeps nothing has nothing to
 * hand over and nowhere to send it.
 */
const UNMET: Record<keyof Contract, string> = {
  input: 'Nothing. It works from what is already there.',
  context: 'Nothing is carried in or held.',
  process: 'Not stated.',
  result: 'Nothing is determined. What you see is the whole of it.',
  artifact: 'Nothing. This one keeps nothing, so there is nothing to take.',
  continue: 'Nowhere. It produces nothing to carry on with.',
};

const LAYER_NOTE: Record<string, string> = {
  PRODUCT: 'A tool. It takes something and gives something back.',
  INSTRUMENT: 'An instrument. It measures, and the reading is the output.',
  EXPERIENCE: 'An experience. It demonstrates what this studio builds, and owes you no file.',
};

interface Props {
  /** A `MODES` id. */
  id: string;
  /**
   * `full` prints the proposition and every row — the opening state of a tool.
   * `brief` prints the rows only, for somewhere that already has a heading.
   */
  variant?: 'full' | 'brief';
}

export function ProductContract({ id, variant = 'full' }: Props) {
  const product = productOf(id);
  if (!product) return null;

  const isExperience = product.layer === 'EXPERIENCE';

  return (
    <div className="pc" data-layer={product.layer} data-variant={variant}>
      {variant === 'full' && (
        <p className="t-body-s pc__proposition">{product.proposition}</p>
      )}

      <p className="t-mono t-mono-xs pc__layer">
        <span className="pc__layer-mark" aria-hidden="true" />
        {LAYER_NOTE[product.layer]}
      </p>

      {!isExperience && (
        <dl className="pc__rows">
          {ROWS.map(({ key, label }) => {
            const answer = product.contract[key];
            return (
              <div key={key} className="pc__row" data-answered={answer ? 'true' : 'false'}>
                <dt className="t-mono t-mono-xs pc__k">{label}</dt>
                <dd className="t-body-s pc__v">
                  {answer ?? <span className="pc__unmet">{UNMET[key]}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
