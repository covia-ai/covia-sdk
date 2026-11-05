import { trimSlashes, trimTrailingSlashes } from '../strings';
import { didUrl } from '../did';

describe('trimTrailingSlashes', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['a', 'a'],
    ['a/', 'a'],
    ['a///', 'a'],
    ['/a/b//', '/a/b'],
    ['//a', '//a'],
  ])('%j → %j', (input, out) => expect(trimTrailingSlashes(input)).toBe(out));
});

describe('trimSlashes', () => {
  it.each([
    ['', ''],
    ['///', ''],
    ['a', 'a'],
    ['/a/', 'a'],
    ['//a/b//', 'a/b'],
  ])('%j → %j', (input, out) => expect(trimSlashes(input)).toBe(out));
});

// CodeQL js/polynomial-redos: a long run of slashes that isn't at the end made
// the old /\/+$/ regexes quadratic. The scans must stay linear.
describe('slash trimming on adversarial input', () => {
  const run = '/'.repeat(100000);
  const fast = (fn: () => void) => {
    const start = Date.now();
    fn();
    expect(Date.now() - start).toBeLessThan(1000);
  };

  it('trimTrailingSlashes', () => fast(() => expect(trimTrailingSlashes(run + 'x')).toBe(run + 'x')));
  it('trimSlashes', () => fast(() => expect(trimSlashes('x' + run + 'x')).toBe('x' + run + 'x')));
  it('didUrl', () => fast(() => expect(didUrl(null, 'w', 'a' + run + 'b')).toBe(`w/a${run}b`)));
});
