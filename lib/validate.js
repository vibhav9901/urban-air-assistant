/** Strict allow-list validation: unknown values are rejected, never "cleaned". */
const ALLOWED = Object.freeze({
  health: ['children', 'elderly', 'respiratory', 'pregnant'],
  commute: ['walk', 'bike', 'two-wheeler', 'transit', 'car', 'remote'],
  home: ['gas-stove', 'biomass-heating', 'incense', 'no-purifier'],
});
const CITY_RE = /^[\p{L}\p{M}][\p{L}\p{M} .,'’-]{1,79}$/u;

function pickList(value, allowed, name) {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value) || value.length > allowed.length || !value.every((v) => allowed.includes(v))) {
    return { ok: false, error: `Invalid ${name}.` };
  }
  return { ok: true, value: [...new Set(value)] };
}

/** @param {unknown} body */
export function validateRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Invalid request.' };
  const { city, commute = 'transit' } = /** @type {Record<string, unknown>} */ (body);
  if (typeof city !== 'string' || !CITY_RE.test(city.trim())) return { ok: false, error: 'Enter a valid city name.' };
  if (!ALLOWED.commute.includes(/** @type {string} */ (commute))) return { ok: false, error: 'Invalid commute.' };
  const health = pickList(body.health, ALLOWED.health, 'health options');
  const home = pickList(body.home, ALLOWED.home, 'home options');
  if (!health.ok) return health;
  if (!home.ok) return home;
  return { ok: true, value: { city: city.trim(), profile: { health: health.value, commute, home: home.value } } };
}
