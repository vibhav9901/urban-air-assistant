const form = document.querySelector('#form');
const statusEl = document.querySelector('#status');
const results = document.querySelector('#results');
const button = document.querySelector('#go');

const checked = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
const make = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text; // textContent only: API output is never parsed as HTML
  if (cls) n.className = cls;
  return n;
};
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  if (isError) statusEl.dataset.error = ''; else delete statusEl.dataset.error;
}

function render(d) {
  results.replaceChildren();
  const title = make('h2', `${d.place}: AQI ${d.aqi} (${d.band})`);
  title.id = 'r-title';
  const summary = make('div', '', 'card');
  summary.dataset.level = d.level;
  summary.append(
    make('p', `Fine particles (PM2.5): ${Math.round(d.pm25)} µg/m³, roughly like smoking ${d.cigarettes} cigarette(s) a day if you stayed outdoors.`),
    ...(d.narrative ? [make('p', d.narrative)] : []),
  );
  const list = make('ol');
  for (const a of d.actions) {
    const li = make('li', '', 'card');
    li.dataset.level = d.level;
    li.append(make('strong', a.text), make('p', `Why it matters: ${a.impact}`, 'impact'));
    list.append(li);
  }
  results.append(title, summary, make('h3', 'Your plan for today'), list);
  results.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { city: form.city.value.trim(), health: checked('health'), commute: form.commute.value, home: checked('home') };
  if (!body.city) { setStatus('Please enter your city.', true); form.city.focus(); return; }
  button.disabled = true;
  setStatus('Fetching live air quality…');
  try {
    const res = await fetch('/api/advice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    render(data);
    setStatus('Your plan is ready.');
    results.focus();
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', true);
  } finally {
    button.disabled = false;
  }
});
