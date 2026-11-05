/**
 * Internal string helpers. Not exported from the package.
 *
 * Slash trimming is done with index scans rather than `/\/+$/`-style regexes:
 * an unanchored-start regex retries from every `/` in a long run that isn't at
 * the end, which is quadratic on untrusted input (CodeQL js/polynomial-redos).
 */

/** `s` without trailing `/` characters. */
export function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* '/' */) end--;
  return end === s.length ? s : s.slice(0, end);
}

/** `s` without leading or trailing `/` characters. */
export function trimSlashes(s: string): string {
  let start = 0;
  while (start < s.length && s.charCodeAt(start) === 47 /* '/' */) start++;
  return trimTrailingSlashes(s.slice(start));
}
