/**
 * Country flag URLs (round style similar to native pickers).
 * Source: circle-flags (public SVG repository via jsDelivr CDN).
 */
const CIRCLE_FLAG_CDN = 'https://cdn.jsdelivr.net/gh/HatScripts/circle-flags/flags';

/** App `country` field -> ISO alpha-2 country code used by the icon set. */
const COUNTRY_ISO2: Record<string, string> = {
  vn: 'vn',
  us: 'us',
  uk: 'gb',
  jp: 'jp',
  kr: 'kr',
  cn: 'cn',
  th: 'th',
  sg: 'sg'
};

/** SVG URL for a country code, or `null` for `all` / unknown (use globe fallback). */
export function countryFlaticonPngUrl(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v || v === 'all') {
    return null;
  }
  const iso2 = COUNTRY_ISO2[v];
  if (!iso2) {
    return null;
  }
  return `${CIRCLE_FLAG_CDN}/${iso2}.svg`;
}
