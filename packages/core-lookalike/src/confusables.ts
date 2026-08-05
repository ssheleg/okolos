/**
 * Reducing a name to what it looks like.
 *
 * Two hosts that render almost identically should reduce to the same string, so
 * that comparing them is a string comparison rather than a judgement call. The
 * table is the common attack set rather than the full Unicode confusables file:
 * a table nobody can read is a table nobody can check, and every entry here is
 * one seen in real campaigns.
 */

const CONFUSABLE: Record<string, string> = {
  // Cyrillic — the workhorse of homograph attacks
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c',
  'х': 'x', 'у': 'y', 'і': 'i', 'ѕ': 's', 'һ': 'h',
  'к': 'k', 'м': 'm', 'т': 't', 'в': 'b', 'н': 'h',
  // Greek
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ρ': 'p', 'ν': 'v',
  'υ': 'u', 'ι': 'i', 'κ': 'k', 'τ': 't', 'χ': 'x',
  // Latin look-alikes and digits
  'ı': 'i', 'ɡ': 'g', 'ǝ': 'e', '‐': '-', '‑': '-',
  '0': 'o', '1': 'l', '3': 'e', '5': 's', '7': 't',
  // Full-width forms
  'ａ': 'a', 'ｅ': 'e', 'ｏ': 'o',
}

/** Ranges that must not be mixed inside one label without saying so. */
const SCRIPTS: ReadonlyArray<{ name: string; test: RegExp }> = [
  { name: 'latin', test: /[a-z]/ },
  { name: 'cyrillic', test: /[Ѐ-ӿ]/ },
  { name: 'greek', test: /[Ͱ-Ͽ]/ },
  { name: 'han', test: /[一-鿿]/ },
  { name: 'arabic', test: /[؀-ۿ]/ },
]

/**
 * The form two visually similar names share. `rn` collapses to `m` because at
 * body-text size they are the same shape, which is what makes `rnicrosoft`
 * work on a real person.
 */
export function skeleton(label: string): string {
  const mapped = [...label.toLowerCase()]
    .map((char) => CONFUSABLE[char] ?? char)
    .join('')
  return mapped.replace(/rn/g, 'm').replace(/vv/g, 'w')
}

/** True when one label draws on more than one script — the strongest signal there is. */
export function mixesScripts(label: string): boolean {
  const lower = label.toLowerCase()
  const present = SCRIPTS.filter((script) => script.test.test(lower))
  return present.length > 1
}
