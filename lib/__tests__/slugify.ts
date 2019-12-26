import slugify from '../slugify';

describe('slugify', () => {
  it('converts to kebab case', () => {
    expect(slugify('Hello World! This is a test.')).toEqual('hello-world-this-is-a-test');
    expect(slugify('"Remove PunctUATiOn!"')).toEqual('remove-punctuation');
    expect(slugify("It's good enough")).toEqual('its-good-enough');
    expect(slugify('99 Luftballons')).toEqual('99-luftballons');
  });

  it('correctly replaces accented characters', () => {
    expect(slugify('Straßenzüge')).toEqual('strassenzuege');
    expect(slugify('Ägyptische Könige')).toEqual('aegyptische-koenige');
  });

  it('handles certain punctuation depending on the language', () => {
    expect(slugify('2 + 2 = 4', 'en')).toEqual('2-plus-2-equals-4');
    expect(slugify('2 + 2 = 4', 'de')).toEqual('2-plus-2-gleich-4');
    expect(slugify('A & B', 'en')).toEqual('a-and-b');
    expect(slugify('A&B', 'en')).toEqual('a-and-b');
    expect(slugify('A & B', 'de')).toEqual('a-und-b');
  });
});
