import { bareHex } from '../values-util';

// Venue 0.11+ writes slice keys as 0x hex and still returns some ids bare
// (covia-sdk#133); bareHex is what makes the two compare equal.
describe('bareHex', () => {
  it.each([
    ['0xabcdef01', 'abcdef01'],
    ['abcdef01', 'abcdef01'],
    ['0XABCDEF01', 'abcdef01'],
    ['ABCDEF01', 'abcdef01'],
    ['  0xabcdef01 ', 'abcdef01'],
  ])('reads %p as %p', (input, expected) => {
    expect(bareHex(input)).toBe(expected);
  });
});
