// Teacher page (#/teacher): class progress from the Google Sheet (needs the teacher key).

import { fetchClass, syncEnabled } from './sync.js?v=8';
import { loadChartJs } from './progress-view.js?v=8';

const KEY = 'telugu-ladder-teacher-key';
const BANDS = [
  { from: 1, to: 2, key: 'band1' }, { from: 3, to: 4, key: 'band2' }, { from: 5, to: 6, key: 'band3' },
  { from: 7, to: 8, key: 'band4' }, { from: 9, to: 10, key: 'band5' }, { done: true, key: 'band6' },
];
let charts = [];

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const store = {
  get() { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private window */ } },
};

function bandOf(s, total) {
  if (s.passed >= total) return BANDS.length - 1;
  const i = BANDS.findIndex((b) => !b.done && s.level >= b.from && s.level <= b.to);
  return i < 0 ? 0 : i;
}

function ago(iso, t) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return t('tNow');
  if (min < 60) return t('tMinAgo', { n: min });
  if (min < 60 * 24) return t('tHourAgo', { n: Math.round(min / 60) });
  return d.toLocaleDateString();
}

export async function renderTeacher(ctx) {
  const { h, t, show, topBar } = ctx;
  for (const c of charts) c.destroy();
  charts = [];
  if (!syncEnabled()) {
    show(topBar('teacher'), h('h2', { class: 'page-title' }, `👩‍🏫 ${t('tTitle')}`), h('div', { class: 'card notice' }, t('tNoSheet')));
    return;
  }
  const keyIn = h('input', { type: 'password', value: store.get(), placeholder: t('tKey'), 'aria-label': t('tKey'), autocomplete: 'current-password' });
  const status = h('p', { class: 'status', role: 'status' });
  const out = h('div', {});
  const load = async () => {
    status.className = 'status';
    status.textContent = t('loading');
    let data;
    try {
      data = await fetchClass(keyIn.value.trim());
    } catch {
      status.className = 'status bad';
      status.textContent = t('tNetError');
      return;
    }
    if (!data?.ok) {
      status.className = 'status bad';
      status.textContent = t('tWrongKey');
      return;
    }
    store.set(keyIn.value.trim());
    status.className = 'status ok';
    status.textContent = `✅ ${t('tUpdated', { time: new Date().toLocaleTimeString() })}`;
    drawClass(ctx, out, data);
  };
  keyIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  show(
    topBar('teacher'),
    h('h2', { class: 'page-title' }, `👩‍🏫 ${t('tTitle')}`),
    h('div', { class: 'card' },
      h('div', { class: 'key-row' }, keyIn, h('button', { class: 'primary', onclick: load }, `🔄 ${t('tLoad')}`)),
      status),
    out,
  );
  if (keyIn.value) load();
}

async function drawClass(ctx, out, data) {
  const { h, t, total = 10 } = ctx;
  for (const c of charts) c.destroy();
  charts = [];
  const all = data.students ?? [];
  const codes = [...new Set(all.map((s) => s.classCode))].sort();
  let code = codes.length === 1 ? codes[0] : '';

  const render = async () => {
    for (const c of charts) c.destroy();
    charts = [];
    const list = all.filter((s) => !code || s.classCode === code)
      .sort((a, b) => b.passed - a.passed || b.stars - a.stars || a.name.localeCompare(b.name));
    const today = new Date().toDateString();
    const activeToday = list.filter((s) => new Date(s.lastActive).toDateString() === today).length;
    const avg = list.length ? (list.reduce((a, s) => a + s.passed, 0) / list.length).toFixed(1) : '0';
    const finished = list.filter((s) => s.passed >= total).length;

    const select = h('select', { 'aria-label': t('tClass'), onchange: (e) => { code = e.target.value; render(); } },
      h('option', { value: '' }, t('tAllClasses')),
      codes.map((c) => h('option', { value: c, selected: c === code }, c)));
    const tile = (icon, label, value, color) => h('div', { class: 'stat', style: `--c:${color}` },
      h('span', { class: 'stat-icon', 'aria-hidden': 'true' }, icon), h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label));

    if (!list.length) {
      out.replaceChildren(h('div', { class: 'card' }, h('div', { class: 'row space' }, select), h('p', {}, t('tNoStudents'))));
      return;
    }

    const counts = BANDS.map(() => 0);
    for (const s of list) counts[bandOf(s, total)] += 1;
    const pieCanvas = h('canvas', { role: 'img', 'aria-label': t('tPie') });
    const legend = h('ul', { class: 'legend' }, BANDS.map((b, i) => h('li', {},
      h('span', { class: 'swatch', style: `background:var(--series-${i + 1})` }), h('span', { class: 'legend-label' }, t(b.key)), h('b', {}, String(counts[i])))));
    const barCanvas = h('canvas', { role: 'img', 'aria-label': t('tBar') });

    const table = h('table', { class: 'roster' },
      h('thead', {}, h('tr', {}, [t('tName'), t('tClass'), t('tNowAt'), t('tPassed'), '★', t('accuracy'), t('tLastActive')].map((x) => h('th', {}, x)))),
      h('tbody', {}, list.map((s) => h('tr', {},
        h('td', { class: 'name' }, s.name),
        h('td', {}, s.classCode),
        h('td', {}, s.question ? t('tLevelQ', { l: s.level, q: s.question }) : t('tLevelOnly', { l: s.level })),
        h('td', {}, `${s.passed} / ${total}`),
        h('td', {}, String(s.stars)),
        h('td', {}, s.answered ? `${s.accuracy}%` : '–'),
        h('td', {}, ago(s.lastActive, t))))));

    out.replaceChildren(
      h('div', { class: 'row space teacher-bar' }, select,
        data.sheetUrl ? h('a', { class: 'btn', href: data.sheetUrl, target: '_blank', rel: 'noopener' }, `📄 ${t('tOpenSheet')}`) : null),
      h('div', { class: 'stats' },
        tile('🧒', t('tStudents'), String(list.length), '#3b8fe8'),
        tile('🟢', t('tActiveToday'), String(activeToday), '#2bb673'),
        tile('📈', t('tAvgLevels'), avg, '#f5a623'),
        tile('🏆', t('tFinished'), String(finished), '#ff6fa8')),
      h('div', { class: 'card' }, h('h3', {}, `🍩 ${t('tPie')}`), h('div', { class: 'pie-wrap' }, h('div', { class: 'chart-box pie-box' }, pieCanvas), legend)),
      h('div', { class: 'card' }, h('h3', {}, `📶 ${t('tBar')}`), h('div', { class: 'chart-box', style: `height:${Math.max(180, 50 + list.length * 30)}px` }, barCanvas)),
      h('div', { class: 'card' }, h('h3', {}, `📋 ${t('tTable')}`), h('div', { class: 'table-wrap' }, table)),
    );

    let Chart;
    try { Chart = await loadChartJs(); } catch { return; }
    if (!pieCanvas.isConnected) return;
    Chart.defaults.font.family = "'Baloo Tammudu 2', 'Noto Sans Telugu', system-ui, sans-serif";
    Chart.defaults.color = css('--muted');
    const tooltip = { backgroundColor: css('--tooltip-bg'), titleColor: css('--tooltip-text'), bodyColor: css('--tooltip-text'), padding: 10, cornerRadius: 12 };
    charts.push(new Chart(pieCanvas, {
      type: 'doughnut',
      data: { labels: BANDS.map((b) => t(b.key)), datasets: [{ data: counts, backgroundColor: BANDS.map((_, i) => css(`--series-${i + 1}`)), borderColor: css('--chart-gap'), borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: '58%', plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${t('tPeople', { n: c.parsed })}` } } } },
    }));
    charts.push(new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: list.map((s) => (codes.length > 1 && !code ? `${s.name} (${s.classCode})` : s.name)),
        datasets: [{ data: list.map((s) => s.passed), backgroundColor: css('--series-1'), borderRadius: { topRight: 6, bottomRight: 6 }, borderSkipped: 'start', maxBarThickness: 20 }],
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        scales: {
          x: { min: 0, max: total, ticks: { stepSize: 1 }, grid: { color: css('--grid') }, border: { display: false } },
          y: { grid: { display: false }, ticks: { color: css('--text') } },
        },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => { const s = list[c.dataIndex]; return ` ${s.passed} / ${total} • ★ ${s.stars} • ${s.accuracy}%`; } } } },
      },
    }));
  };
  render();
}
