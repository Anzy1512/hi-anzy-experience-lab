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
 * A row whose answer is null renders as NOT YET rather than being hidden. That
 * is the whole reason this component is worth having: a visitor opening
 * DIRECTOR should be told, on the way in, that it takes no input and hands
 * nothing back — because it currently does not, and a surface that quietly
 * omits the two rows it cannot fill is how a demo passes for a product.
 *
 * It also means the registry cannot drift. If Phase 8.8 gives Director a brief
 * to read and forgets to update the contract, the mode says NOT YET about a
 * thing it now does, which somebody will notice.
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
  { key: 'artifact', label: 'ARTIFACT' },
  { key: 'continue', label: 'CONTINUE' },
];

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
                  {answer ?? (
                    <span className="pc__unmet">
                      NOT YET — this tool cannot answer that.
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
