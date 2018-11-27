export interface LocaleDependentSlugParts {
  equals: string;
  ampersand: string;
  plus: string;
}

export const localeDependentSlugParts: { [locale: string]: LocaleDependentSlugParts } = {
  en: { equals: 'equals', ampersand: 'and', plus: 'plus' },
  de: { equals: 'gleich', ampersand: 'und', plus: 'plus' },
};

export default function slugify(string: string, lang = 'en'): string {
  const s = localeDependentSlugParts[lang] || localeDependentSlugParts.en;

  return string
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/é/g, 'e')
    .replace(/&/g, ` ${s.ampersand} `)
    .replace(/\+/g, ` ${s.plus} `)
    .replace(/=/g, ` ${s.equals} `)
    .replace(/['"‘’“”«»]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}
