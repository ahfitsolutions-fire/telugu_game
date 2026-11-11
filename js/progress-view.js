// "నా ప్రగతి" page (#/progress): the student's own growth, from local progress.
// Doughnut: levels won / playing now / locked. Bar: best score per level. Line: levels won per day.

import * as P from './progress.js?v=7';

const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let chartsLoading = null;
let charts = [];

function loadChartJs() {
  if (globalThis.Chart) return Promise.resolve(globalThis.Chart);
  chartsLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CHART_JS;
    s.onload = () => resolve(globalThis.Chart);
    s.onerror = () => { chartsLoading = null; reject(new Error('chart.js')); };
    document.head.append(s);
  });
  return chartsLoading;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export async function renderProgress({ h, t, show, topBar, progress, levels, total = 10 }) {
  for (const c of charts) c.destroy();
  charts = [];

  const passed = P.passedCount(progress, total);
  const current = P.currentLevel(progress, total);
  const sum = P.summarize(progress, progress.student, total);
  const acc = sum.answered ? Math.round((sum.correct / sum.answered) * 100) : 0;
  const days = (progress.history ?? []).length;

  const tile = (icon, label, value, color) => h('div', { class: 'stat', style: `--c:${color}` },
    h('span', { class: 'stat-icon', 'aria-hidden': 'true' }, icon),
    h('div', { class: 'stat-value' }, value),
    h('div', { class: 'stat-label' }, label));

  const tiles = h('div', { class: 'stats' },
    tile('🏅', t('myLevels'), `${passed} / ${total}`, '#2bb673'),
    tile('⭐', t('myStars'), String(sum.stars), '#f5a623'),
    tile('🎯', t('myAccuracy'), `${acc}%`, '#3b8fe8'),
    tile('📅', t('myDays'), String(days), '#ff6fa8'));

  if (!sum.answered) {
    show(topBar('progress'), h('h2', { class: 'page-title' }, `📊 ${t('progressTitle')}`), tiles,
      h('div', { class: 'card' }, h('div', { class: 'buddy' }, h('span', { class: 'buddy-face', 'aria-hidden': 'true' }, '🦜'), h('div', { class: 'bubble' }, t('progressEmpty')))));
    return;
  }

  // Doughnut: won / now / locked
  const locked = Math.max(0, total - passed - (passed < total ? 1 : 0));
  const slices = [
    { label: t('slicePassed'), value: passed, color: css('--series-6') },
    { label: t('sliceNow'), value: passed < total ? 1 : 0, color: css('--series-2') },
    { label: t('sliceLocked'), value: locked, color: css('--neutral') },
  ];
  const pieCanvas = h('canvas', { role: 'img', 'aria-label': t('pieMine') });
  const legend = h('ul', { class: 'legend' }, slices.map((s, i) => h('li', {},
    h('span', { class: 'swatch', style: `background:${['var(--series-6)', 'var(--series-2)', 'var(--neutral)'][i]}` }),
    h('span', { class: 'legend-label' }, s.label),
    h('b', {}, String(s.value)))));

  // Bar: best score per level (only levels played or open)
  const shown = levels.filter((l) => l.level <= current);
  const barCanvas = h('canvas', { role: 'img', 'aria-label': t('barMine') });
  const barLegend = h('ul', { class: 'legend inline' },
    h('li', {}, h('span', { class: 'swatch', style: 'background:var(--series-6)' }), t('barPassed')),
    h('li', {}, h('span', { class: 'swatch', style: 'background:var(--series-2)' }), t('barNotYet')));

  // Line: levels won per day
  const history = progress.history ?? [];
  const lineCanvas = h('canvas', { role: 'img', 'aria-label': t('lineMine') });

  const levelRows = h('ol', { class: 'rank-list' }, shown.map((l) => {
    const L = progress.levels[l.level];
    const best = L?.best ?? 0;
    return h('li', { class: 'rank-row', style: `--c:${l.color}` },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, l.emoji),
      h('span', { class: 'rank-main' },
        h('span', { class: 'rank-name' }, `${t('level')} ${l.level} – ${l.title}`),
        h('span', { class: 'mini-bar' }, h('span', { style: `width:${Math.round((best / 30) * 100)}%` })),
        h('span', { class: 'rank-sub' }, `${t('outOf30', { n: best })}${L?.passed ? ` • ${'★'.repeat(L.stars ?? 1)} ✅` : ''}`)));
  }));

  show(
    topBar('progress'),
    h('h2', { class: 'page-title' }, `📊 ${t('progressTitle')}${progress.student ? ` – ${progress.student}` : ''}`),
    tiles,
    h('div', { class: 'card' }, h('h3', {}, `🍩 ${t('pieMine')}`),
      h('div', { class: 'pie-wrap' }, h('div', { class: 'chart-box pie-box' }, pieCanvas), legend)),
    h('div', { class: 'card' }, h('h3', {}, `📶 ${t('barMine')}`), barLegend,
      h('div', { class: 'chart-box', style: `height:${Math.max(180, 50 + shown.length * 34)}px` }, barCanvas)),
    history.length ? h('div', { class: 'card' }, h('h3', {}, `🌱 ${t('lineMine')}`), h('div', { class: 'chart-box', style: 'height:240px' }, lineCanvas)) : null,
    h('div', { class: 'card' }, levelRows),
  );

  let Chart;
  try { Chart = await loadChartJs(); } catch { return; } // offline: tiles + list still show everything
  if (!pieCanvas.isConnected) return;

  const text = css('--text');
  const muted = css('--muted');
  const grid = css('--grid');
  Chart.defaults.font.family = "'Baloo Tammudu 2', 'Noto Sans Telugu', system-ui, sans-serif";
  Chart.defaults.font.size = 14;
  Chart.defaults.color = muted;
  const tooltip = { backgroundColor: css('--tooltip-bg'), titleColor: css('--tooltip-text'), bodyColor: css('--tooltip-text'), padding: 10, cornerRadius: 12 };

  const center = {
    id: 'center',
    afterDraw(chart) {
      const { ctx, chartArea: a } = chart;
      if (!a) return;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = text;
      ctx.font = "700 30px 'Baloo Tammudu 2', 'Noto Sans Telugu', sans-serif";
      ctx.fillText(`${passed}/${total}`, (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 10);
      ctx.restore();
    },
  };

  charts.push(new Chart(pieCanvas, {
    type: 'doughnut',
    data: { labels: slices.map((s) => s.label), datasets: [{ data: slices.map((s) => s.value), backgroundColor: slices.map((s) => s.color), borderColor: css('--chart-gap'), borderWidth: 3, hoverOffset: 8 }] },
    options: { maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip } },
    plugins: [center],
  }));

  charts.push(new Chart(barCanvas, {
    type: 'bar',
    data: {
      labels: shown.map((l) => `${l.emoji} ${l.level}`),
      datasets: [{
        data: shown.map((l) => progress.levels[l.level]?.best ?? 0),
        backgroundColor: shown.map((l) => (progress.levels[l.level]?.passed ? css('--series-6') : css('--series-2'))),
        borderRadius: { topRight: 6, bottomRight: 6 },
        borderSkipped: 'start',
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        x: { min: 0, max: 30, ticks: { stepSize: 5 }, grid: { color: grid }, border: { display: false } },
        y: { grid: { display: false }, ticks: { color: text, font: { size: 15 } } },
      },
      plugins: {
        legend: { display: false },
        tooltip: { ...tooltip, callbacks: { title: (c) => `${t('level')} ${shown[c[0].dataIndex].level} – ${shown[c[0].dataIndex].title}`, label: (c) => ` ${t('outOf30', { n: c.parsed.x })}` } },
      },
    },
  }));

  if (history.length) {
    const color = css('--series-1');
    charts.push(new Chart(lineCanvas, {
      type: 'line',
      data: {
        labels: history.map((x) => `${x.d.slice(8, 10)}/${x.d.slice(5, 7)}`),
        datasets: [{ label: t('myLevels'), data: history.map((x) => x.p), borderColor: color, backgroundColor: `${color}22`, fill: true, borderWidth: 2, pointRadius: 5, pointHoverRadius: 7, tension: 0.3 }],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { min: 0, max: total, ticks: { stepSize: 2 }, grid: { color: grid }, border: { display: false } },
          x: { grid: { display: false } },
        },
        plugins: { legend: { display: false }, tooltip: { ...tooltip, callbacks: { label: (c) => ` ${t('myLevels')}: ${c.parsed.y}` } } },
      },
    }));
  }
}
