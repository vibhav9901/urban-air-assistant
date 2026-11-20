import { validateRequest } from '../lib/validate.js';
import { buildPlan } from '../lib/aqi.js';

const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const RATE = { limit: 20, windowMs: 60_000 };
const airCache = new Map();
const hits = new Map();

/** Best-effort per-instance limiter (serverless instances are ephemeral). */
function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE.limit;
}

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return res.json();
}

async function locate(city) {
  const q = new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' });
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  const hit = data.results?.[0];
  return hit ? { name: `${hit.name}, ${hit.country ?? ''}`.replace(/, $/, ''), lat: hit.latitude, lon: hit.longitude } : null;
}

async function airQuality({ lat, lon }) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = airCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const q = new URLSearchParams({ latitude: lat, longitude: lon, current: 'us_aqi,pm2_5', timezone: 'auto' });
  const { current } = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}`);
  const value = { aqi: Number(current?.us_aqi), pm25: Number(current?.pm2_5) };
  if (!Number.isFinite(value.aqi) || !Number.isFinite(value.pm25)) throw new Error('No air data');
  airCache.set(key, { at: Date.now(), value });
  return value;
}

/** Optional GenAI summary. The prompt contains only numbers, enums and the geocoded place name (no raw user text). */
async function narrate({ place, aqi, band, plan, profile }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `You are a calm public-health communicator. In under 70 words, explain to a family in ${place} what today's US AQI of ${aqi} (${band}) means and the single most valuable action from this list: ${plan.actions.map((a) => a.id).join(', ')}. Household: ${profile.health.join(', ') || 'no sensitive members'}. Do not give medical diagnoses.`;
  try {
    const data = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0.3 } }),
    });
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null; // GenAI is an enhancement; the rule-based plan always works.
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).setHeader('Allow', 'POST').json({ error: 'Method not allowed.' });
  const ip = String(req.headers['x-forwarded-for'] ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });

  const parsed = validateRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  try {
    const loc = await locate(parsed.value.city);
    if (!loc) return res.status(404).json({ error: 'City not found. Try a nearby larger city.' });
    const { aqi, pm25 } = await airQuality(loc);
    const plan = buildPlan({ aqi, pm25, profile: parsed.value.profile });
    const narrative = await narrate({ place: loc.name, aqi, band: plan.band.label, plan, profile: parsed.value.profile });
    return res.status(200).json({ place: loc.name, aqi, pm25, band: plan.band.label, level: plan.band.level, cigarettes: plan.cigarettes, actions: plan.actions, narrative });
  } catch {
    return res.status(502).json({ error: 'Air quality data is temporarily unavailable. Please retry shortly.' });
  }
}
