/**
 * Pure, dependency-free decision logic. No I/O, so it is fully unit-testable.
 * @typedef {{health:string[], commute:string, home:string[]}} Profile
 * @typedef {{id:string, priority:number, text:string, impact:string}} Action
 */

/** US AQI bands (EPA). */
export const BANDS = Object.freeze([
  { max: 50, level: 0, label: 'Good' },
  { max: 100, level: 1, label: 'Moderate' },
  { max: 150, level: 2, label: 'Unhealthy for sensitive groups' },
  { max: 200, level: 3, label: 'Unhealthy' },
  { max: 300, level: 4, label: 'Very unhealthy' },
  { max: Infinity, level: 5, label: 'Hazardous' },
]);

/** @param {number} aqi */
export function bandFor(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) throw new RangeError('aqi must be a non-negative number');
  return BANDS.find((b) => aqi <= b.max);
}

/** Berkeley Earth rule of thumb: 22 µg/m³ PM2.5 over 24h ≈ 1 cigarette. Approximate. */
export function cigaretteEquivalent(pm25) {
  return Math.round((Math.max(0, pm25) / 22) * 10) / 10;
}

const OUTDOOR_COMMUTES = new Set(['walk', 'bike', 'two-wheeler', 'transit']);

/**
 * @param {{aqi:number, pm25:number, profile:Profile}} input
 * @returns {{band: typeof BANDS[number], cigarettes:number, actions:Action[]}}
 */
export function buildPlan({ aqi, pm25, profile }) {
  const { level } = bandFor(aqi);
  const { health, commute, home } = profile;
  const vulnerable = health.length > 0;
  /** @type {Action[]} */
  const actions = [];
  const add = (cond, id, priority, text, impact) => cond && actions.push({ id, priority, text, impact });

  add(level === 0, 'enjoy', 5, 'Air is clean: open windows for a full airing-out and exercise outdoors.',
    'Fresh-air ventilation flushes indoor pollutants built up during smoggy days.');
  add(vulnerable && level >= 2, 'protect-sensitive', 1,
    'Keep children, elders and anyone with asthma or heart/lung conditions indoors; skip outdoor play and school sports. Keep rescue medication handy.',
    'Children breathe faster per kilo of body weight, so they take in proportionally more pollution than adults.');
  add(level >= 2 && OUTDOOR_COMMUTES.has(commute), 'mask', 2,
    'Wear a well-fitted N95/FFP2 mask outdoors and on open transit platforms (not a cloth or surgical mask).',
    'A well-fitted N95 filters at least 95% of fine particles, cutting what you inhale on your commute by up to ~90% in practice.');
  add(level >= 3 && (commute === 'bike' || commute === 'walk'), 'exercise', 3,
    'Move workouts indoors and, if you must travel, pick low-traffic streets away from main roads.',
    'Hard exercise can raise your breathing rate several-fold, multiplying the pollution dose.');
  add(level >= 2 && commute === 'car', 'car-cabin', 3,
    'Close windows and use recirculation mode with a clean cabin filter; avoid idling in queues.',
    'Recirculation reduces particles entering the cabin; less idling means fewer emissions in your own street.');
  add(level >= 1 && commute !== 'remote' && commute !== 'walk' && commute !== 'bike', 'low-emission', 4,
    'Choose public transport, carpooling or an electric option for at least one trip today.',
    'One avoided 10 km petrol-car trip prevents roughly 1.5–2 kg of CO₂ plus local exhaust particles.');
  add(level >= 2, 'ventilate', 3,
    'Keep windows shut; if you must ventilate, do it for 5–10 minutes in the afternoon when winter inversions usually ease.',
    'Short, well-timed airing limits how much smog is drawn indoors.');
  add(level >= 2 && home.includes('no-purifier'), 'purifier', 2,
    'Run a HEPA purifier in the bedroom, or build a Corsi–Rosenthal box (box fan + 4 MERV-13 filters).',
    'Portable HEPA filtration typically lowers indoor PM2.5 by 50–70% in a closed room.');
  add(home.includes('gas-stove'), 'cooking', 3,
    'Cook with the extractor hood on, or crack a kitchen window when outdoor air allows.',
    'Cooking is a major indoor source of fine particles and nitrogen dioxide.');
  add(home.includes('incense') || home.includes('biomass-heating'), 'indoor-sources', 4,
    'Pause incense and smoky fuels; switch to electric or clean-fuel heating, and never burn waste or leaves.',
    'Removing indoor combustion often cuts indoor PM2.5 more than any gadget, and reduces neighbourhood smog.');

  actions.sort((a, b) => a.priority - b.priority);
  return { band: bandFor(aqi), cigarettes: cigaretteEquivalent(pm25), actions: actions.slice(0, 8) };
}
