import type { ReportLine } from '@okolos/core-mail'
import type { Resolver } from '@okolos/i18n'

/**
 * SCR-21 in a terminal.
 *
 * **Colour is a third signal, never the signal.** The severity is a word, and
 * the word is printed whether or not the stream is a terminal — a pipe, a log
 * file and a CI transcript all read the same sentence. The browser side learned
 * this on a banner that wrote `Критично` and `Незначительно` in the same ink
 * (B-116); a terminal is where it is easiest to forget, because the escape
 * codes look like formatting rather than like meaning.
 *
 * **The block of checks that did not run is not a footnote and is not dimmed.**
 * It is the same indent and the same weight as the findings above it: a reader
 * who skims the loud part and misses the quiet one has read half an answer and
 * believes they read all of it.
 */

export interface RenderOptions {
  /** Escape codes are added only as decoration over text that already reads. */
  readonly colour: boolean
}

const COLOUR: Readonly<Record<string, string>> = {
  header: '1',
  verdict: '1',
  signal: '31',
  'not-run': '33',
  truncated: '33',
  review: '2',
  checked: '2',
  fact: '',
}

const INDENT: Readonly<Record<string, string>> = {
  header: '',
  verdict: '',
  signal: '  ',
  fact: '    ',
  checked: '  ',
  'not-run': '  ',
  truncated: '',
  review: '',
}

const ESC = String.fromCharCode(27)

function paint(text: string, kind: string, colour: boolean): string {
  const code = COLOUR[kind] ?? ''
  if (!colour || code === '') return text
  return ESC + '[' + code + 'm' + text + ESC + '[0m'
}

/**
 * Some arguments are catalogue keys rather than values — the name of a check,
 * the reason it was skipped — because a key is what survives a change of
 * language (B-115). Resolving them here, at the surface, is the whole point of
 * carrying keys through the report.
 */
function resolveArgs(args: readonly string[], t: Resolver): string[] {
  return args.map((arg) => {
    if (!/^[a-z][A-Za-z0-9_]*$/.test(arg)) return arg
    const resolved = t(arg, [])
    return resolved === `[${arg}]` ? arg : resolved
  })
}

export function render(
  lines: readonly ReportLine[],
  t: Resolver,
  options: RenderOptions,
): string {
  const out: string[] = []
  let gapsStarted = false
  for (const line of lines) {
    if (line.kind === 'not-run' && !gapsStarted) {
      gapsStarted = true
      out.push('')
    }
    const text = t(line.key, resolveArgs(line.args, t))
    out.push(paint((INDENT[line.kind] ?? '') + text, line.kind, options.colour))
  }
  return out.join('\n')
}
