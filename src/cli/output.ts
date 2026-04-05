/**
 * CLI JSON output envelope — three-state output format.
 *
 * States:
 * - Full success:     ok:true,  code:null,              data:T (non-null)
 * - Partial failure:  ok:false, code:"PARTIAL_FAILURE",  data:T (non-null, contains both succeeded and failed items)
 * - Total failure:    ok:false, code:"<ERROR_CODE>",     data:null
 *
 * Key contract: `data` is non-null whenever any work was completed,
 * even if `ok` is false. Agents check `code === "PARTIAL_FAILURE"`
 * to distinguish partial from total failure.
 */

export interface CliMeta {
  command: string;
  projectPath: string;
  duration_ms: number;
  version: string;
}

export interface CliOutput<T = unknown> {
  ok: boolean;
  error: string | null;
  code: string | null;
  warnings: string[];
  data: T | null;
  meta: CliMeta;
}

/**
 * Build a full-success JSON envelope.
 */
export function jsonOutput<T>(data: T, meta: CliMeta, warnings: string[] = []): CliOutput<T> {
  return { ok: true, error: null, code: null, warnings, data, meta };
}

/**
 * Build a total-failure or partial-failure JSON envelope.
 *
 * For partial failure, pass `code: "PARTIAL_FAILURE"` and a non-null `data`
 * containing both succeeded and failed items.
 */
export function jsonError(
  error: string,
  code: string,
  meta: CliMeta,
  warnings: string[] = [],
  data: unknown = null
): CliOutput {
  return { ok: false, error, code, warnings, data, meta };
}

/**
 * Print the result to stdout (JSON mode) or stderr (human-readable errors).
 */
export function printResult(result: CliOutput, jsonMode: boolean): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    if (!result.ok) {
      process.stderr.write(`Error: ${result.error}\n`);
      result.warnings.forEach((w) => process.stderr.write(`  Warning: ${w}\n`));
    }
    // Human-readable success output is handled per-command
  }
}
