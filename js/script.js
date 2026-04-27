'use strict';
// ─── DATA ────────────────────────────────────────────────
const DATA = {
  centre: "ITB",
  dades_base: {
    electricitat: {
      consum_mitja_diari_kWh: 261.54,
      variability_range: { min: 0.02, max: 0.05 },
    },
    aigua: {
      consum_mitja_diari_litres: 850,
      variability_range: { min: 0.02, max: 0.04 },
    },
    consumibles_oficina: {
      variability_range: { min: 0.03, max: 0.05 },
      mitjana_mensual: { paper_A4_paquets: 22.5 },
    },
    productes_neteja: {
      variability_range: { min: 0.02, max: 0.03 },
      mitjana_mensual: { paper_higienic_rotllos: 108 },
    }
  }
};

const DAYS = { ANNUAL: 365, ACADEMIC_YEAR: 304, WINTER: 90 };

const PERIOD_CONFIG = {
  anual:  { electricitat:{days:365,sf:1.0},  aigua:{days:365,sf:1.0},   oficina:{months:12,sf:1.0},  neteja:{months:12,sf:1.0}  },
  curs:   { electricitat:{days:304,sf:1.1},  aigua:{days:304,sf:1.0},   oficina:{months:10,sf:1.2},  neteja:{months:10,sf:1.1}  },
  hivern: { electricitat:{days:90, sf:1.3},  aigua:{days:90, sf:0.8},   oficina:{months:3, sf:1.1},  neteja:{months:3, sf:1.3}  },
};

const MONTHLY_FACTORS = {
  electricitat: [1.15,1.18,1.05,0.92,0.88,0.80,0.75,0.78,0.90,1.02,1.12,1.20],
  aigua:        [0.80,0.82,0.88,0.95,1.05,1.15,1.20,1.18,1.05,0.95,0.85,0.78],
  oficina:      [1.20,1.15,1.10,1.10,1.15,0.80,0.40,0.40,1.20,1.25,1.20,0.60],
  neteja:       [1.30,1.28,1.15,1.05,0.95,0.85,0.80,0.80,1.00,1.10,1.20,1.30],
};

const MONTHS_CA = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_PER_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];
const REDUCTION = 0.70;

function hasChartLib() {
  return typeof window.Chart !== 'undefined';
}

function hasPdfLibs() {
  return !!(window.jspdf && typeof window.jspdf.jsPDF === 'function');
}

function toLocalISODate(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

// ─── VARIABILITY ─────────────────────────────────────────
function getVar(min, max) {
  const r=(Math.random()+Math.random()+Math.random()+Math.random())/4;
  const mag=min+r*(max-min);
  return 1+(Math.random()<.5?1:-1)*mag;
}

// ─── CUSTOM DATE RANGE HELPERS ────────────────────────────
function daysBetween(from, to) {
  return Math.max(1, Math.round((to - from) / 86400000));
}

function avgSeasonalFactor(from, to, factorArr) {
  // weighted average of monthly factors for the date range
  let total = 0, count = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const m = cur.getMonth();
    total += factorArr[m];
    count++;
    cur.setDate(cur.getDate() + 7); // sample weekly
  }
  return count ? total / count : 1;
}

function avgMonthlyFactor(from, to, factorArr) {
  const months = Math.max(1, (to.getFullYear()-from.getFullYear())*12 + to.getMonth() - from.getMonth() + 1);
  let total = 0;
  for (let i = 0; i < months; i++) {
    const m = (from.getMonth() + i) % 12;
    total += factorArr[m];
  }
  return { factor: total/months, months };
}

// ─── COMPUTE ─────────────────────────────────────────────
function compute(period, isReduction, customFrom, customTo) {
  const d = DATA.dades_base;
  const V = (key) => getVar(d[key]?.variability_range?.min || .02, d[key]?.variability_range?.max || .05);

  let elecAny, elecPer, aiguaAny, aiguaPer, ofiAny, ofiPer, netAny, netPer;

  // Always compute annual base
  const ANNUAL = PERIOD_CONFIG.anual;
  elecAny  = Math.round(d.electricitat.consum_mitja_diari_kWh * 365 * ANNUAL.electricitat.sf * V('electricitat'));
  aiguaAny = Math.round(d.aigua.consum_mitja_diari_litres * 365 * ANNUAL.aigua.sf * V('aigua'));
  ofiAny   = Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets * 12 * ANNUAL.oficina.sf * V('consumibles_oficina'));
  netAny   = Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos * 12 * ANNUAL.neteja.sf * V('productes_neteja'));

  if (period === 'custom' && customFrom && customTo) {
    const days = daysBetween(customFrom, customTo);
    const sfE = avgSeasonalFactor(customFrom, customTo, MONTHLY_FACTORS.electricitat);
    const sfA = avgSeasonalFactor(customFrom, customTo, MONTHLY_FACTORS.aigua);
    const rO  = avgMonthlyFactor(customFrom, customTo, MONTHLY_FACTORS.oficina);
    const rN  = avgMonthlyFactor(customFrom, customTo, MONTHLY_FACTORS.neteja);

    elecPer  = Math.round(d.electricitat.consum_mitja_diari_kWh * days * sfE * V('electricitat'));
    aiguaPer = Math.round(d.aigua.consum_mitja_diari_litres * days * sfA * V('aigua'));
    ofiPer   = Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets * rO.months * rO.factor * V('consumibles_oficina'));
    netPer   = Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos * rN.months * rN.factor * V('productes_neteja'));
  } else {
    const P = PERIOD_CONFIG[period] || PERIOD_CONFIG.anual;
    elecPer  = Math.round(d.electricitat.consum_mitja_diari_kWh * P.electricitat.days * P.electricitat.sf * V('electricitat'));
    aiguaPer = Math.round(d.aigua.consum_mitja_diari_litres * P.aigua.days * P.aigua.sf * V('aigua'));
    ofiPer   = Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets * P.oficina.months * P.oficina.sf * V('consumibles_oficina'));
    netPer   = Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos * P.neteja.months * P.neteja.sf * V('productes_neteja'));
  }

  if (isReduction) {
    // Derive reduced values by subtracting exactly 30% of the base.
    // Math.round(v * 0.30) gives the saving; subtracting guarantees the pill always shows -30.00%.
    const exact30pct = v => v - Math.round(v * 0.30);
    return {
      base: { elecAny, elecPer, aiguaAny, aiguaPer, ofiAny, ofiPer, netAny, netPer },
      reduced: {
        elecAny:  exact30pct(elecAny),
        elecPer:  exact30pct(elecPer),
        aiguaAny: exact30pct(aiguaAny),
        aiguaPer: exact30pct(aiguaPer),
        ofiAny:   exact30pct(ofiAny),
        ofiPer:   exact30pct(ofiPer),
        netAny:   exact30pct(netAny),
        netPer:   exact30pct(netPer),
      }
    };
  }
  return { base: { elecAny, elecPer, aiguaAny, aiguaPer, ofiAny, ofiPer, netAny, netPer }, reduced: null };
}

// ─── ANIMATED COUNTER ─────────────────────────────────────
function animateCount(el, target) {
  const str = target.toLocaleString('ca-ES');
  if (!el) return;
  const start = Date.now();
  const dur = 600;
  const from = parseFloat(el.textContent.replace(/[^\d.-]/g,'')) || 0;
  const tick = () => {
    const prog = Math.min((Date.now()-start)/dur, 1);
    const ease = prog < .5 ? 2*prog*prog : -1+(4-2*prog)*prog;
    const cur = Math.round(from + (target-from)*ease);
    el.textContent = cur.toLocaleString('ca-ES');
    if (prog < 1) requestAnimationFrame(tick);
    else el.textContent = str;
  };
  requestAnimationFrame(tick);
}

// ─── RENDER ──────────────────────────────────────────────
function fmt(n) { return n.toLocaleString('ca-ES'); }

function render(result) {
  const { base, reduced } = result;
  const isR = !!reduced;
  const show = reduced || base;

  const grid = document.getElementById('results-grid');
  if (isR) grid.classList.add('reduction-on'); else grid.classList.remove('reduction-on');

  function setRow(idMain, idOld, idPill, baseVal, showVal) {
    const elMain = document.getElementById(idMain);
    const elOld  = document.getElementById(idOld);
    const elPill = document.getElementById(idPill);
    animateCount(elMain, showVal);
    if (isR && elOld) { elOld.textContent = fmt(baseVal); elOld.hidden = false; }
    else if (elOld)   { elOld.hidden = true; }
    if (isR && elPill) {
      elPill.textContent = `−${(30).toFixed(0)}%`;
      elPill.hidden = false;
    } else if (elPill) { elPill.hidden = true; }
  }

  setRow('res-elec-any',    'res-elec-any-old',    'pill-elec-any',    base.elecAny,  show.elecAny);
  setRow('res-elec-periode','res-elec-periode-old','pill-elec-periode', base.elecPer,  show.elecPer);
  setRow('res-aigua-any',   'res-aigua-any-old',   'pill-aigua-any',   base.aiguaAny, show.aiguaAny);
  setRow('res-aigua-periode','res-aigua-periode-old','pill-aigua-periode',base.aiguaPer,show.aiguaPer);
  setRow('res-ofi-any',     'res-ofi-any-old',     'pill-ofi-any',     base.ofiAny,   show.ofiAny);
  setRow('res-ofi-periode', 'res-ofi-periode-old', 'pill-ofi-periode',  base.ofiPer,   show.ofiPer);
  setRow('res-net-any',     'res-net-any-old',     'pill-net-any',     base.netAny,   show.netAny);
  setRow('res-net-periode', 'res-net-periode-old', 'pill-net-periode',  base.netPer,   show.netPer);

  // KPI row — always show ANNUAL values (independent of selected period)
  animateCount(document.getElementById('kpi-elec'),  show.elecAny);
  animateCount(document.getElementById('kpi-water'), show.aiguaAny);
  animateCount(document.getElementById('kpi-paper'), show.ofiAny);
  animateCount(document.getElementById('kpi-clean'), show.netAny);

  // KPI sub-labels — scope only to the calculator tab KPIs
  const calcKpiRow = document.getElementById('kpi-row');
  if (calcKpiRow) calcKpiRow.querySelectorAll('.kpi-sub').forEach(el => {
    if (el.textContent.includes('kWh') || el.textContent.includes('full year')) el.textContent = 'kWh · annual';
    else if (el.textContent.includes('L ·') || el.textContent.includes('L/day')) el.textContent = 'L · annual';
    else if (el.textContent.includes('packs')) el.textContent = 'A4 packs · annual';
    else if (el.textContent.includes('rolls')) el.textContent = 'rolls · annual';
  });

  ['elec','water','paper','clean'].forEach(k => {
    const el = document.getElementById(`kpi-${k}-delta`);
    if (!el) return;
    if (isR) { el.textContent = '−30% active'; el.hidden = false; }
    else el.hidden = true;
  });

  // Savings banner
  const banner = document.getElementById('saving-summary');
  if (isR) {
    banner.hidden = false;
    const sE = base.elecAny - show.elecAny;
    const sA = base.aiguaAny - show.aiguaAny;
    banner.innerHTML = `
      <strong>Estimated annual savings with −30% plan:</strong><br>
      ⚡ <strong>${fmt(sE)} kWh</strong> less electricity<br>
      💧 <strong>${fmt(sA)} L</strong> less water<br>
      📝 <strong>${fmt(base.ofiAny - show.ofiAny)} A4 packs</strong> less paper<br>
      🧼 <strong>${fmt(base.netAny - show.netAny)} rolls</strong> less cleaning paper
    `;
  } else { banner.hidden = true; }

  // Impact bars — each resource normalized against its OWN annual baseline (= 100%)
  function setBar(fillId, pctId, val, refMax) {
    const pct = Math.min(100, Math.round(val / refMax * 100));
    const fill = document.getElementById(fillId);
    const lbl  = document.getElementById(pctId);
    if (fill) fill.style.width = pct + '%';
    if (lbl)  lbl.textContent = pct + '%';
  }
  setBar('imp-elec-any',  'imp-elec-any-pct',  show.elecAny,  base.elecAny);
  setBar('imp-elec-per',  'imp-elec-per-pct',  show.elecPer,  base.elecAny);
  setBar('imp-water-any', 'imp-water-any-pct', show.aiguaAny, base.aiguaAny);
  setBar('imp-water-per', 'imp-water-per-pct', show.aiguaPer, base.aiguaAny);
  setBar('imp-paper-any', 'imp-paper-any-pct', show.ofiAny,   base.ofiAny);
  setBar('imp-clean-any', 'imp-clean-any-pct', show.netAny,   base.netAny);
}

// ─── CHARTS ──────────────────────────────────────────────
const charts = {};

function buildMonthlyKWh(dailyAvg, mfArr) {
  return DAYS_PER_MONTH.map((d,i) => Math.round(dailyAvg * d * mfArr[i] * getVar(.02,.04)));
}
function buildMonthlyUnits(monthAvg, mfArr) {
  return MONTHS_CA.map((_,i) => Math.round(monthAvg * mfArr[i] * getVar(.02,.04)));
}

function makeChart(canvasId, label, data, color, unit, labels) {
  if (!hasChartLib()) return;
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  if (charts[canvasId]) { charts[canvasId].destroy(); }
  const [r,g,b] = color;
  const chartLabels = labels || MONTHS_CA;
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [{
        label,
        data,
        backgroundColor: `rgba(${r},${g},${b},.65)`,
        hoverBackgroundColor: `rgba(${r},${g},${b},.85)`,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toLocaleString('ca-ES')} ${unit}` } }
      },
      scales: {
        x: { grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#5a7a96',font:{size:10}} },
        y: {
          grid:{color:'rgba(255,255,255,.04)'},
          ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'},
            callback:v=>v>=1000?(v/1000).toFixed(1)+'k':v}
        }
      }
    }
  });
}

// Returns { labels, elecData, waterData, paperData, cleanData } filtered to the active period
function buildChartDataForPeriod(period, customFrom, customTo) {
  const d = DATA.dades_base;
  // Determine which months to include
  let monthIndices;
  if (period === 'custom' && customFrom && customTo) {
    // Collect every month index spanned by the custom range
    const seen = new Set();
    const cur = new Date(customFrom);
    while (cur <= customTo) {
      seen.add(cur.getMonth());
      cur.setDate(cur.getDate() + 1);
    }
    monthIndices = [...seen].sort((a,b) => a-b);
  } else if (period === 'curs') {
    // Academic year: Sep(8)–Jun(5)
    monthIndices = [8,9,10,11,0,1,2,3,4,5];
  } else if (period === 'hivern') {
    monthIndices = [11,0,1];
  } else {
    // anual or fallback: all 12 months
    monthIndices = [0,1,2,3,4,5,6,7,8,9,10,11];
  }

  const labels    = monthIndices.map(i => MONTHS_CA[i]);
  const elecData  = monthIndices.map(i => Math.round(d.electricitat.consum_mitja_diari_kWh * DAYS_PER_MONTH[i] * MONTHLY_FACTORS.electricitat[i] * getVar(.02,.04)));
  const waterData = monthIndices.map(i => Math.round(d.aigua.consum_mitja_diari_litres    * DAYS_PER_MONTH[i] * MONTHLY_FACTORS.aigua[i]        * getVar(.02,.04)));
  const paperData = monthIndices.map(i => Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets        * MONTHLY_FACTORS.oficina[i] * getVar(.02,.04)));
  const cleanData = monthIndices.map(i => Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos    * MONTHLY_FACTORS.neteja[i]  * getVar(.02,.04)));
  return { labels, elecData, waterData, paperData, cleanData };
}

function renderCharts(period, customFrom, customTo) {
  if (!hasChartLib()) return;
  const { labels, elecData, waterData, paperData, cleanData } = buildChartDataForPeriod(period, customFrom, customTo);

  makeChart('chart-elec',  'Electricitat', elecData,  [251,191,36], 'kWh',     labels);
  makeChart('chart-water', 'Aigua',        waterData, [56,189,248], 'L',       labels);
  makeChart('chart-paper', 'Paper A4',     paperData, [167,139,250],'paquets', labels);
  makeChart('chart-clean', 'Neteja',       cleanData, [52,211,153], 'rotllos', labels);

  // Combined chart (normalized)
  const maxE = Math.max(...elecData);
  const maxW = Math.max(...waterData);
  const maxP = Math.max(...paperData);
  const maxC = Math.max(...cleanData);
  const normE = elecData.map(v=>+(v/maxE*100).toFixed(1));
  const normW = waterData.map(v=>+(v/maxW*100).toFixed(1));
  const normP = paperData.map(v=>+(v/maxP*100).toFixed(1));
  const normC = cleanData.map(v=>+(v/maxC*100).toFixed(1));

  const ctxComb = document.getElementById('chart-combined')?.getContext('2d');
  if (ctxComb) {
    if (charts['combined']) charts['combined'].destroy();
    charts['combined'] = new Chart(ctxComb, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label:'⚡ Electricity', data: normE, borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.08)', fill:true, tension:.4, pointRadius:3, pointHoverRadius:6 },
          { label:'💧 Water',        data: normW, borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.08)',  fill:true, tension:.4, pointRadius:3, pointHoverRadius:6 },
          { label:'📝 Paper',        data: normP, borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,.08)',fill:true, tension:.4, pointRadius:3, pointHoverRadius:6 },
          { label:'🧼 Cleaning',       data: normC, borderColor:'#34d399', backgroundColor:'rgba(52,211,153,.08)', fill:true, tension:.4, pointRadius:3, pointHoverRadius:6 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: { labels:{ color:'#94afc8', font:{size:11}, boxWidth:12, padding:16 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y}%` } }
        },
        scales: {
          x: { grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#5a7a96',font:{size:10}} },
          y: { grid:{color:'rgba(255,255,255,.04)'}, ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'}, callback:v=>v+'%'}, min:0, max:110 }
        }
      }
    });
  }

  // Compare chart
  renderCompareCharts();
}

function renderCompareCharts() {
  if (!hasChartLib()) return;
  const d = DATA.dades_base;
  const p = PERIOD_CONFIG.anual;

  const baseE = Math.round(d.electricitat.consum_mitja_diari_kWh * 365 * p.electricitat.sf);
  const baseA = Math.round(d.aigua.consum_mitja_diari_litres * 365 * p.aigua.sf / 1000); // kL
  const baseO = Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets * 12);
  const baseN = Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos * 12);

  // Exact 30%: saving = round(base * 0.30), reduced = base - saving
  const redE = baseE - Math.round(baseE * 0.30);
  const redA = baseA - Math.round(baseA * 0.30);
  const redO = baseO - Math.round(baseO * 0.30);
  const redN = baseN - Math.round(baseN * 0.30);

  // Comparison bar chart
  const ctxC = document.getElementById('chart-compare')?.getContext('2d');
  if (ctxC) {
    if (charts['compare']) charts['compare'].destroy();
    charts['compare'] = new Chart(ctxC, {
      type: 'bar',
      data: {
        labels: ['⚡ Elèc (kWh÷10)', '💧 Water (kL)', '📝 Paper', '🧼 Cleaning'],
        datasets: [
          { label:'Current baseline', data:[baseE/10,baseA,baseO,baseN], backgroundColor:'rgba(90,122,150,.5)', borderRadius:5 },
          { label:'With −30% plan', data:[redE/10,redA,redO,redN],   backgroundColor:'rgba(52,211,153,.65)', borderRadius:5 },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:'#94afc8',font:{size:10},boxWidth:10}},
          tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}`}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10}}},
          y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'}}}
        }
      }
    });
  }

  // Savings over 3 years
  const ctxS = document.getElementById('chart-savings3y')?.getContext('2d');
  if (ctxS) {
    if (charts['savings3y']) charts['savings3y'].destroy();
    const savingY = [baseE*0.10, baseE*0.20, baseE*0.30].map(Math.round);
    charts['savings3y'] = new Chart(ctxS, {
      type: 'line',
      data: {
        labels: ['Year 1','Year 2','Year 3'],
        datasets: [
          { label:'Cumulative savings (kWh)', data:savingY, borderColor:'#34d399', backgroundColor:'rgba(52,211,153,.12)', fill:true, tension:.3, pointRadius:6, pointBackgroundColor:'#34d399' },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:'#94afc8',font:{size:10},boxWidth:10}},
          tooltip:{callbacks:{label:c=>` ${c.parsed.y.toLocaleString()} kWh saved`}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10}}},
          y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v}}
        }
      }
    });
  }
}

// ─── STATE ───────────────────────────────────────────────
const state = { isReduction: false };

function getCustomDates() {
  const from = document.getElementById('date-from').value;
  const to   = document.getElementById('date-to').value;
  if (from && to) return { from: new Date(from), to: new Date(to) };
  return null;
}

function handleCalc() {
  const period = document.getElementById('periode-select').value;

  // Show/hide custom date block
  const customBlock = document.getElementById('custom-date-block');
  customBlock.hidden = (period !== 'custom');

  let customFrom, customTo;
  if (period === 'custom') {
    const cd = getCustomDates();
    if (!cd) { customBlock.hidden = false; return; }
    customFrom = cd.from; customTo = cd.to;
    // Update period label
    const diffDays = Math.round((customTo - customFrom) / 86400000);
    document.getElementById('kpi-period-label').textContent = `— ${diffDays} custom days`;
  } else {
    const labels = { anual:'full year', curs:'academic year', hivern:'winter' };
    document.getElementById('kpi-period-label').textContent = `— ${labels[period]}`;
  }

  const result = compute(period, state.isReduction, customFrom, customTo);
  render(result);
  renderCharts(period, customFrom, customTo);
}

function activateDemoMode() {
  const periodSelect = document.getElementById('periode-select');
  if (periodSelect) periodSelect.value = 'anual';

  if (!state.isReduction) {
    const toggleBtn = document.getElementById('btn-reduccio');
    if (toggleBtn) toggleBtn.click();
  } else {
    handleCalc();
  }

  const featuredMeasures = ['cb-sensors','cb-led','cb-solar','cb-airejadors','cb-cisternes','cb-zeropaper','cb-assecadors','cb-ecologics'];
  document.querySelectorAll('.sim-cb').forEach(cb => {
    cb.checked = featuredMeasures.includes(cb.id);
  });
  updateSimulator();

  const kpiRow = document.getElementById('kpi-row');
  if (kpiRow) {
    kpiRow.classList.remove('flash');
    void kpiRow.offsetWidth;
    kpiRow.classList.add('flash');
    setTimeout(() => kpiRow.classList.remove('flash'), 1000);
    kpiRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── EVENTS ──────────────────────────────────────────────
document.getElementById('btn-calcular').addEventListener('click', handleCalc);
document.getElementById('btn-demo').addEventListener('click', activateDemoMode);
document.getElementById('periode-select').addEventListener('change', handleCalc);
document.getElementById('date-from').addEventListener('change', handleCalc);
document.getElementById('date-to').addEventListener('change', handleCalc);

document.getElementById('btn-reduccio').addEventListener('click', () => {
  state.isReduction = !state.isReduction;
  const btn = document.getElementById('btn-reduccio');
  btn.setAttribute('aria-pressed', String(state.isReduction));
  if (state.isReduction) {
    btn.classList.add('active');
    btn.querySelector('i').className = 'fa-solid fa-check';
    btn.querySelector('span').textContent = 'Plan Active (−30%)';
  } else {
    btn.classList.remove('active');
    btn.querySelector('i').className = 'fa-solid fa-power-off';
    btn.querySelector('span').textContent = 'Activate Reduction (−30%)';
  }
  handleCalc();
});

// ─── TAB NAVIGATION ──────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    if (target) {
      target.classList.add('active');
      // Lazy render charts when switching to grafics tab
      if (tab.dataset.tab === 'grafics') {
        setTimeout(() => {
          const p = document.getElementById('periode-select').value;
          let cf, ct;
          if (p === 'custom') { const cd = getCustomDates(); if (cd) { cf = cd.from; ct = cd.to; } }
          renderCharts(p, cf, ct);
        }, 50);
      }
      if (tab.dataset.tab === 'pla') {
        setTimeout(updateSimulator, 80);
      }
    }
  });
});

// ─── YEAR FILTER (roadmap) ────────────────────────────────
document.querySelectorAll('.year-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const year = btn.dataset.year;
    document.querySelectorAll('.rm-step').forEach(step => {
      if (year === 'all' || step.dataset.year === year) {
        step.classList.remove('dimmed');
      } else {
        step.classList.add('dimmed');
      }
    });
  });
});

// ─── PDF EXPORT ──────────────────────────────────────────
async function exportPDF() {
  const btn = document.getElementById('btn-pdf');
  if (!btn) return;
  if (!hasPdfLibs()) {
    alert('PDF library not loaded. Please check your connection and try again.');
    return;
  }
  const origText = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating…';
  btn.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W = 210, H = 297, M = 16;
    const CW = W - M * 2; // content width

    // ── Color palette ──────────────────────────────────────
    const C = {
      bg:     [8, 12, 16],
      bg2:    [14, 20, 25],
      bg3:    [19, 26, 34],
      border: [30, 45, 61],
      green:  [52, 211, 153],
      blue:   [56, 189, 248],
      yellow: [251, 191, 36],
      purple: [167, 139, 250],
      red:    [248, 113, 113],
      text:   [226, 234, 242],
      text2:  [148, 175, 200],
      muted:  [90, 122, 150],
      white:  [255, 255, 255],
    };

    const period = document.getElementById('periode-select').value;
    const periodLabel = {
      anual:  'Full Year (12 months)',
      curs:   'Academic Year (Sep–Jun)',
      hivern: 'Winter (Dec–Feb)',
      custom: 'Custom Date Range'
    }[period] || 'Full Year';

    const dateStr = new Date().toLocaleDateString('en-GB', { year:'numeric', month:'long', day:'numeric' });
    const dateTimeStr = new Date().toLocaleString('en-GB');

    // ── Helper functions ───────────────────────────────────
    function setFill(...rgb) { doc.setFillColor(...rgb); }
    function setStroke(...rgb) { doc.setDrawColor(...rgb); }
    function setColor(...rgb) { doc.setTextColor(...rgb); }
    function font(style, size) { doc.setFont('helvetica', style); doc.setFontSize(size); }

    function rect(x, y, w, h, clr, style='F') {
      setFill(...clr); doc.rect(x, y, w, h, style);
    }
    function rrect(x, y, w, h, clr, r=2, style='F') {
      setFill(...clr); doc.roundedRect(x, y, w, h, r, r, style);
    }
    function line(x1, y1, x2, y2, clr, lw=0.3) {
      setStroke(...clr); doc.setLineWidth(lw);
      doc.line(x1, y1, x2, y2);
    }
    function txt(text, x, y, opts={}) { doc.text(text, x, y, opts); }

    // Pill / badge
    function pill(text, x, y, bgClr, textClr, w=null) {
      font('bold', 6.5);
      const tw = w || doc.getTextWidth(text) + 6;
      rrect(x, y-3.5, tw, 5, bgClr, 1.5);
      setColor(...textClr);
      txt(text, x + tw/2, y, {align:'center'});
    }

    // Divider
    function divider(y, clr=C.border) { line(M, y, W-M, y, clr, 0.2); }

    // Section header
    function sectionHeader(label, y, clr=C.green) {
      font('bold', 7);
      setColor(...clr);
      txt(label.toUpperCase(), M, y);
      line(M + doc.getTextWidth(label.toUpperCase()) + 3, y, W-M, y, [...clr, 0.3], 0.25);
      return y + 6;
    }

    // Page footer
    function addFooter(pageNum, total) {
      rect(0, H-11, W, 11, C.bg2);
      line(0, H-11, W, H-11, C.border, 0.4);
      font('normal', 6.5); setColor(...C.muted);
      txt('ITB · Sustainable Calculator · Circular Economy Phase 3 · 2025–2026', M, H-5.5);
      txt(`Page ${pageNum} / ${total}`, W-M, H-5.5, {align:'right'});
      // Green accent dot
      setFill(...C.green); doc.circle(W/2, H-5.5, 0.8, 'F');
    }

    // Indicator card row
    function indicatorRow(label, value, unit, baseValue, clr, y, isReduction) {
      const rowH = isReduction && baseValue ? 14 : 11;
      rrect(M, y, CW, rowH, C.bg2, 2);
      // Color accent bar
      rect(M, y, 3, rowH, clr);
      // Label
      font('normal', 7.5); setColor(...C.text2);
      txt(label, M+6, y + (isReduction && baseValue ? 5.5 : 4.5));
      // Value
      font('bold', isReduction && baseValue ? 8.5 : 9.5);
      setColor(...clr);
      const valStr = `${value} ${unit}`;
      txt(valStr, W-M-3, y + (isReduction && baseValue ? 9.5 : 6.5), {align:'right'});
      // Baseline (strikethrough)
      if (isReduction && baseValue) {
        font('normal', 7); setColor(...C.muted);
        const bStr = `${baseValue} ${unit}`;
        const bx = W-M-3 - doc.getTextWidth(bStr);
        txt(bStr, W-M-3, y+4.5, {align:'right'});
        // Manual strikethrough
        const tw = doc.getTextWidth(bStr);
        line(W-M-3-tw, y+3.5, W-M-3, y+3.5, C.muted, 0.25);
        // Savings pill
        pill('−30%', M+6, y+10.5, [52,211,153,0.15], C.green, 14);
      }
      return y + rowH + 2;
    }

    // Mini bar chart (drawn in PDF)
    function miniBar(label, value, maxVal, clr, y) {
      font('normal', 7); setColor(...C.muted);
      txt(label, M, y+3);
      const trackX = M + 42, trackW = CW - 55, trackH = 5;
      rrect(trackX, y, trackW, trackH, C.bg3, 1.5);
      const fillW = Math.max(2, Math.round(value / maxVal * trackW));
      setFill(...clr); doc.roundedRect(trackX, y, fillW, trackH, 1.5, 1.5, 'F');
      font('bold', 7); setColor(...clr);
      const pct = Math.round(value / maxVal * 100);
      txt(`${pct}%`, W-M, y+3.5, {align:'right'});
      return y + 8;
    }

    // ══════════════════════════════════════════════════════
    //  PAGE 1 — COVER + EXECUTIVE SUMMARY
    // ══════════════════════════════════════════════════════

    // Full-page dark background
    rect(0, 0, W, H, C.bg);

    // Top decorative gradient band
    rect(0, 0, W, 58, C.bg2);
    // Green accent top border
    rect(0, 0, W, 3, C.green);

    // Subtle grid pattern (horizontal lines)
    for (let gy = 8; gy < 58; gy += 8) {
      line(0, gy, W, gy, [30,45,61,0.4], 0.15);
    }

    // Logo / Icon area
    setFill(...C.green); doc.setGState(new doc.GState({opacity: 0.15}));
    doc.circle(W-22, 29, 18, 'F');
    doc.setGState(new doc.GState({opacity: 1}));
    font('bold', 14); setColor(...C.green);
    txt('ITB', W-26, 34);

    // Title block
    font('bold', 20); setColor(...C.text);
    txt('Sustainable Calculator', M, 24);
    font('normal', 10); setColor(...C.green);
    txt('Institut de Tecnologia del Bages  ·  ITB', M, 33);
    font('normal', 7.5); setColor(...C.muted);
    txt('Real Consumption Analysis  ·  Seasonal Variability  ·  Circular Economy', M, 41);

    // Tags row
    const tags = [
      {t:'8 Indicators', c:C.yellow},
      {t:'Charts', c:C.blue},
      {t:'−30% Reduction', c:C.yellow},
      {t:periodLabel, c:C.purple},
    ];
    let tx = M;
    tags.forEach(tag => {
      font('bold', 6); setColor(...tag.c);
      const tw = doc.getTextWidth(tag.t) + 8;
      rrect(tx, 47, tw, 6, tag.c.map(v => Math.round(v * 0.12)), 1.5);
      txt(tag.t, tx+4, 51.5);
      tx += tw + 4;
    });

    // Meta info box
    rrect(M, 62, CW, 18, C.bg2, 3);
    line(M, 62, M+CW, 62, C.green, 0.3);

    font('bold', 7); setColor(...C.muted);
    txt('PERIOD', M+4, 70);
    txt('REDUCTION PLAN', M+60, 70);
    txt('GENERATED', M+120, 70);

    font('bold', 8.5); setColor(...C.text);
    txt(periodLabel, M+4, 76);

    if (state.isReduction) {
      font('bold', 8.5); setColor(...C.green);
      txt('ACTIVE (−30%)', M+60, 76);
    } else {
      font('bold', 8.5); setColor(...C.red);
      txt('NOT ACTIVE', M+60, 76);
    }

    font('normal', 8); setColor(...C.text2);
    txt(dateStr, M+120, 76);

    let y = 87;

    // ── EXECUTIVE SUMMARY ─────────────────────────────────
    y = sectionHeader('Executive Summary — KPIs', y, C.green);

    // 4 big KPI cards in a 2×2 grid
    const kpiData = [
      { label:'Electricity', id:'kpi-elec', unit:'kWh/year', clr:C.yellow, sub:'Annual full year' },
      { label:'Water', id:'kpi-water', unit:'L/year', clr:C.blue, sub:'Annual full year' },
      { label:'Office Paper', id:'kpi-paper', unit:'A4 packs/year', clr:C.purple, sub:'Annual full year' },
      { label:'Cleaning', id:'kpi-clean', unit:'rolls/year', clr:C.green, sub:'Annual full year' },
    ];

    const kpiW = (CW - 6) / 2;
    const kpiH = 22;
    kpiData.forEach((k, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const kx = M + col * (kpiW + 6);
      const ky = y + row * (kpiH + 4);

      rrect(kx, ky, kpiW, kpiH, C.bg2, 3);
      // Top accent
      rect(kx, ky, kpiW, 2, k.clr);

      font('normal', 7); setColor(...C.muted);
      txt(k.label, kx+5, ky+8);

      const val = document.getElementById(k.id)?.textContent || '–';
      font('bold', 13); setColor(...k.clr);
      txt(val, kx+5, ky+17);

      font('normal', 6.5); setColor(...C.muted);
      txt(k.unit, kx + kpiW - 4, ky+17, {align:'right'});
    });

    y += kpiH * 2 + 4 * 2 + 6;

    // ── 8 INDICATORS TABLE ────────────────────────────────
    y = sectionHeader('8 Sustainability Indicators', y, C.blue);

    const indData = [
      { label:'[A] Electricity — Next year',        id:'res-elec-any',      oldId:'res-elec-any-old',      unit:'kWh',      clr:C.yellow  },
      { label:'[B] Electricity — Selected period',   id:'res-elec-periode',  oldId:'res-elec-periode-old',  unit:'kWh',      clr:C.yellow  },
      { label:'[C] Water — Next year',               id:'res-aigua-any',     oldId:'res-aigua-any-old',     unit:'L',        clr:C.blue    },
      { label:'[D] Water — Selected period',         id:'res-aigua-periode', oldId:'res-aigua-periode-old', unit:'L',        clr:C.blue    },
      { label:'[E] Office Paper — Next year',        id:'res-ofi-any',       oldId:'res-ofi-any-old',       unit:'A4 packs', clr:C.purple  },
      { label:'[F] Office Paper — Selected period',  id:'res-ofi-periode',   oldId:'res-ofi-periode-old',   unit:'A4 packs', clr:C.purple  },
      { label:'[G] Cleaning Products — Next year',   id:'res-net-any',       oldId:'res-net-any-old',       unit:'rolls',    clr:C.green   },
      { label:'[H] Cleaning Products — Selected period', id:'res-net-periode', oldId:'res-net-periode-old',  unit:'rolls',    clr:C.green   },
    ];

    indData.forEach(ind => {
      if (y > H - 30) { /* overflow guard — shouldn't trigger on p1 */ }
      const val  = document.getElementById(ind.id)?.textContent || '–';
      const base = document.getElementById(ind.oldId)?.textContent || '';
      y = indicatorRow(ind.label, val, ind.unit, base, ind.clr, y, state.isReduction);
    });

    y += 3;

    // ── RELATIVE IMPACT BARS ──────────────────────────────
    if (y < H - 60) {
      y = sectionHeader('Relative Impact by Indicator', y, C.purple);
      const impData = [
        { label:'Electricity year', id:'imp-elec-any', pctId:'imp-elec-any-pct', clr:C.yellow },
        { label:'Electricity period', id:'imp-elec-per', pctId:'imp-elec-per-pct', clr:[251,191,36] },
        { label:'Water year', id:'imp-water-any', pctId:'imp-water-any-pct', clr:C.blue },
        { label:'Paper year', id:'imp-paper-any', pctId:'imp-paper-any-pct', clr:C.purple },
        { label:'Cleaning year', id:'imp-clean-any', pctId:'imp-clean-any-pct', clr:C.green },
      ];
      const maxPct = 100;
      impData.forEach(imp => {
        const pct = parseInt(document.getElementById(imp.pctId)?.textContent) || 0;
        y = miniBar(imp.label, pct, maxPct, imp.clr, y);
      });
    }

    // Footer page 1
    addFooter(1, 2);

    // ══════════════════════════════════════════════════════
    //  PAGE 2 — CHARTS + 3-YEAR PLAN + TIPS
    // ══════════════════════════════════════════════════════
    doc.addPage();
    rect(0, 0, W, H, C.bg);
    rect(0, 0, W, 3, C.green);

    // Page header
    rrect(0, 3, W, 16, C.bg2, 0);
    font('bold', 9); setColor(...C.text);
    txt('Sustainable Calculator · ITB', M, 14);
    font('normal', 7); setColor(...C.muted);
    txt('3-Year Reduction Plan  &  Practical Tips', W-M, 14, {align:'right'});

    y = 25;

    // ── CHARTS CAPTURE ────────────────────────────────────
    y = sectionHeader('Monthly Distribution Charts', y, C.yellow);
    try {
      const chartIds = ['chart-elec','chart-water','chart-paper','chart-clean'];
      const chartLabels = ['Electricity (kWh/month)','Water (L/month)','Office Paper (packs/month)','Cleaning (rolls/month)'];
      const chartClrs = [C.yellow, C.blue, C.purple, C.green];
      const imgW = (CW - 4) / 2, imgH = 32;

      // Temporarily make the charts tab visible so canvases have real dimensions
      const graficsTab = document.getElementById('tab-grafics');
      const wasHidden = graficsTab && graficsTab.style.display === 'none' || (graficsTab && !graficsTab.classList.contains('active'));
      if (graficsTab && wasHidden) {
        graficsTab.style.cssText = 'display:flex !important; visibility:hidden; position:absolute; pointer-events:none;';
      }
      // Re-render charts to ensure they're painted at correct size
      const period = document.getElementById('periode-select').value;
      const customFrom = state.customFrom || undefined;
      const customTo = state.customTo || undefined;
      renderCharts(period, customFrom, customTo);
      // Small yield to let Chart.js finish painting
      await new Promise(r => setTimeout(r, 300));

      for (let ci = 0; ci < chartIds.length; ci++) {
        const canvas = document.getElementById(chartIds[ci]);
        const col = ci % 2, row = Math.floor(ci / 2);
        const cx = M + col * (imgW + 4);
        const cy = y + row * (imgH + 10);

        rrect(cx, cy, imgW, imgH + 8, C.bg2, 2);
        font('bold', 6.5); setColor(...chartClrs[ci]);
        txt(chartLabels[ci], cx + 3, cy + 5);

        let chartAdded = false;
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          try {
            const imgData = canvas.toDataURL('image/png');
            if (imgData && imgData.length > 500) {
              doc.addImage(imgData, 'PNG', cx+1, cy+6, imgW-2, imgH);
              chartAdded = true;
            }
          } catch(e) { /* tainted canvas, fall through */ }
        }
        if (!chartAdded) {
          font('italic', 7); setColor(...C.muted);
          txt('[Chart not available]', cx + imgW/2, cy + imgH/2 + 4, {align:'center'});
        }
      }

      // Restore tab visibility
      if (graficsTab && wasHidden) {
        graficsTab.style.cssText = '';
      }

      y += (imgH + 10) * 2 + 6;
    } catch(e) {
      y += 4;
    }

    // ── 3-YEAR REDUCTION PLAN ─────────────────────────────
    y = sectionHeader('3-Year Reduction Plan', y, C.green);

    const planData = [
      {
        resource:'Electricity', clr:C.yellow,
        steps:[
          {yr:'Year 1',phase:'Reduce',   badge:'−10%', desc:'Presence sensors in all classrooms and common areas'},
          {yr:'Year 2',phase:'Reuse',    badge:'−15%', desc:'Full LED lighting replacement across all facilities'},
          {yr:'Year 3',phase:'Recycle',  badge:'−15%', desc:'Solar panel expansion +15 kWp · Own renewable energy'},
        ]
      },
      {
        resource:'Water', clr:C.blue,
        steps:[
          {yr:'Year 1',phase:'Reduce',   badge:'−10%', desc:'Aerator installation on all taps in the centre'},
          {yr:'Year 2',phase:'Reduce',   badge:'−10%', desc:'Dual-flush cisterns in all toilet facilities'},
          {yr:'Year 3',phase:'Recycle',  badge:'−12%', desc:'Rainwater collection system for garden irrigation'},
        ]
      },
      {
        resource:'Office Paper', clr:C.purple,
        steps:[
          {yr:'Year 1',phase:'Reduce',   badge:'−15%', desc:'Mandatory Zero Paper policy on Moodle & digital comms'},
          {yr:'Year 2',phase:'Reuse',    badge:'−5%',  desc:'Exclusive purchase of refillable pens and markers'},
          {yr:'Year 3',phase:'Recycle',  badge:'−12%', desc:'Full digitalisation of admin procedures & cloud archiving'},
        ]
      },
      {
        resource:'Cleaning', clr:C.green,
        steps:[
          {yr:'Year 1',phase:'Reduce',   badge:'−20%', desc:'Replace paper towels with energy-efficient air dryers'},
          {yr:'Year 2',phase:'Reuse',    badge:'−8%',  desc:'Bulk soap and products in reusable refillable containers'},
          {yr:'Year 3',phase:'Recycle',  badge:'−5%',  desc:'Exclusive certified probiotic and ecological cleaning products'},
        ]
      },
    ];

    const phaseClr = { Reduce: C.red, Reuse: C.yellow, Recycle: C.green };

    planData.forEach(resource => {
      if (y > H - 36) { return; } // skip if no space (safety)
      rrect(M, y, CW, 8, C.bg2, 2);
      rect(M, y, 3, 8, resource.clr);
      font('bold', 8); setColor(...resource.clr);
      txt(resource.resource, M+6, y+5.5);

      // Progress dots
      const totalPct = resource.steps.reduce((s,st) => s + parseInt(st.badge), 0);
      font('bold', 7); setColor(...C.muted);
      txt(`Total: ${totalPct}%`, W-M-3, y+5.5, {align:'right'});
      y += 10;

      resource.steps.forEach(step => {
        if (y > H - 20) return;
        rrect(M+3, y, CW-3, 9, C.bg3, 1.5);
        // Year badge
        font('bold', 6); setColor(...C.muted);
        txt(step.yr, M+6, y+3.5);
        // Phase pill
        const pc2 = phaseClr[step.phase] || C.green;
        pill(step.phase, M+20, y+4.5, pc2.map(v=>Math.round(v*0.15)), pc2, 18);
        // Badge
        font('bold', 7); setColor(...resource.clr);
        txt(step.badge, M+42, y+5);
        // Description
        font('normal', 7); setColor(...C.text2);
        txt(step.desc, M+54, y+5);
        y += 11;
      });
      y += 3;
    });

    y += 2;

    // ── PRACTICAL TIPS ────────────────────────────────────
    if (y < H - 50) {
      y = sectionHeader('Practical Tips for Reducing Consumption', y, C.blue);

      const tipsData = [
        {cat:'ELECTRICITY', clr:C.yellow, items:[
          'Install presence sensors for automatic lighting control',
          'Replace all lighting with low-consumption LED (−50% lighting)',
          'Install photovoltaic solar panels on the roof (−40% bill)',
          'Schedule auto-shutdown of electronics outside school hours',
        ]},
        {cat:'WATER', clr:C.blue, items:[
          'Aerators on all taps — reduces flow by up to 50%',
          'Replace cisterns with dual-flush models',
          'Collect rainwater for irrigation of landscaped areas',
        ]},
        {cat:'OFFICE PAPER', clr:C.purple, items:[
          '"Zero Paper" policy for internal communications',
          'Digitalise all academic and administrative procedures',
          'Double-sided printing by default on all printers',
        ]},
        {cat:'CLEANING', clr:C.green, items:[
          'Replace paper towels with low-consumption air dryers',
          'Purchase soaps and products in bulk in reusable containers',
          'Use exclusively certified ecological cleaning products',
        ]},
      ];

      const tipColW = (CW - 4) / 2;
      let tipCol = 0, tipColY = [y, y];

      tipsData.forEach(t => {
        const col = tipCol % 2;
        let ty = tipColY[col];
        if (ty > H - 25) return;

        const itemH = t.items.length * 5.5 + 14;
        rrect(M + col*(tipColW+4), ty, tipColW, itemH, C.bg2, 2);
        rect(M + col*(tipColW+4), ty, tipColW, 2, t.clr);
        font('bold', 7); setColor(...t.clr);
        txt(t.cat, M + col*(tipColW+4) + 4, ty+8);

        t.items.forEach((item, ii) => {
          font('normal', 6.5); setColor(...C.text2);
          const iy = ty + 13 + ii * 5.5;
          setColor(...t.clr); txt('→', M + col*(tipColW+4) + 4, iy);
          setColor(...C.text2); txt(item, M + col*(tipColW+4) + 9, iy, {maxWidth: tipColW - 13});
        });

        tipColY[col] += itemH + 4;
        tipCol++;
      });
    }

    // Savings summary box (if reduction active)
    if (state.isReduction) {
      const boxY = Math.max(...[0,1].map(c => (typeof tipColY !== 'undefined' ? 0 : 0))) ;
      // Show at bottom of page
      const sumY = H - 35;
      if (y < sumY - 5) {
        rrect(M, sumY, CW, 22, [52,211,153,0.08], 3);
        rect(M, sumY, CW, 2, C.green);
        font('bold', 8); setColor(...C.green);
        txt('Estimated Annual Savings with 30% Reduction Plan', M+4, sumY+8);

        const sE = document.getElementById('res-elec-any-old')?.textContent;
        const rE = document.getElementById('res-elec-any')?.textContent;
        if (sE && rE) {
          const saved = (parseInt(sE.replace(/\D/g,'')) - parseInt(rE.replace(/\D/g,'')));
          font('normal', 7); setColor(...C.text2);
          txt(`Electricity: ${saved.toLocaleString()} kWh saved`, M+4, sumY+15);
          txt(`Water -30%  |  Paper -30%  |  Cleaning -30%`, M+4, sumY+20.5);
        }
      }
    }

    // Footer page 2
    addFooter(2, 2);

    // ── Save ──────────────────────────────────────────────
    const fname = `ITB_Sustainability_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fname);

  } catch(e) {
    console.error(e);
    alert('Error generating PDF: ' + e.message);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

// ─── SIMULATOR ───────────────────────────────────────────
const SIM_MEASURES = [
  { id:'cb-sensors',       resource:'elec',  pct:10 },
  { id:'cb-led',           resource:'elec',  pct:15 },
  { id:'cb-solar',         resource:'elec',  pct:15 },
  { id:'cb-airejadors',    resource:'water', pct:10 },
  { id:'cb-cisternes',     resource:'water', pct:10 },
  { id:'cb-pluvials',      resource:'water', pct:12 },
  { id:'cb-zeropaper',     resource:'paper', pct:15 },
  { id:'cb-recarregables', resource:'paper', pct:5  },
  { id:'cb-digitalitzacio',resource:'paper', pct:12 },
  { id:'cb-assecadors',    resource:'clean', pct:20 },
  { id:'cb-granel',        resource:'clean', pct:8  },
  { id:'cb-ecologics',     resource:'clean', pct:5  },
];

// Base annual values (no variability for simulator clarity)
function getSimBase() {
  const d = DATA.dades_base;
  const p = PERIOD_CONFIG.anual;
  return {
    elec:  Math.round(d.electricitat.consum_mitja_diari_kWh * 365 * p.electricitat.sf),
    water: Math.round(d.aigua.consum_mitja_diari_litres * 365 * p.aigua.sf),
    paper: Math.round(d.consumibles_oficina.mitjana_mensual.paper_A4_paquets * 12 * p.oficina.sf),
    clean: Math.round(d.productes_neteja.mitjana_mensual.paper_higienic_rotllos * 12 * p.neteja.sf),
  };
}

let simDonutChart = null;

function initSimDonut() {
  if (!hasChartLib()) return;
  const ctx = document.getElementById('sim-donut')?.getContext('2d');
  if (!ctx) return;
  simDonutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['rgba(52,211,153,.85)', 'rgba(30,45,61,.5)'],
        borderWidth: 0,
        borderRadius: 4,
        hoverOffset: 0,
      }]
    },
    options: {
      responsive: false,
      cutout: '72%',
      animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    }
  });
}

function calcSimReductions() {
  const reductions = { elec: 0, water: 0, paper: 0, clean: 0 };
  // Use compound reduction: each measure applies to remaining consumption
  const remaining = { elec: 1, water: 1, paper: 1, clean: 1 };
  SIM_MEASURES.forEach(m => {
    const cb = document.getElementById(m.id);
    if (cb && cb.checked) {
      remaining[m.resource] *= (1 - m.pct / 100);
    }
  });
  Object.keys(reductions).forEach(k => {
    reductions[k] = Math.round((1 - remaining[k]) * 100);
  });
  return reductions;
}

function updateSimMeasureStyles() {
  document.querySelectorAll('.sim-measure').forEach(lbl => {
    const cb = lbl.querySelector('.sim-cb');
    const res = lbl.dataset.resource;
    if (cb && cb.checked) {
      lbl.classList.add(`active-${res}`);
    } else {
      ['active-elec','active-water','active-paper','active-clean'].forEach(c => lbl.classList.remove(c));
    }
  });
}

function updateSimulator() {
  updateSimMeasureStyles();
  const reds = calcSimReductions();
  const base = getSimBase();

  // Weighted average: weight each resource by its relative environmental impact
  // Electricity dominates, so give it more weight in the overall % shown
  const weights = { elec: 0.50, water: 0.25, paper: 0.15, clean: 0.10 };
  const avg = Math.round(
    reds.elec  * weights.elec  +
    reds.water * weights.water +
    reds.paper * weights.paper +
    reds.clean * weights.clean
  );

  // Update donut
  if (simDonutChart) {
    const col = avg >= 25 ? 'rgba(52,211,153,.85)' : avg >= 15 ? 'rgba(251,191,36,.85)' : 'rgba(248,113,113,.65)';
    simDonutChart.data.datasets[0].data = [avg, 100 - avg];
    simDonutChart.data.datasets[0].backgroundColor[0] = col;
    simDonutChart.update('active');
  }

  // Update total pct label
  const totalEl = document.getElementById('sim-total-pct');
  if (totalEl) totalEl.textContent = `−${avg}%`;

  // Per-resource progress bars in left cards
  ['elec','water','paper','clean'].forEach(key => {
    const pct = reds[key];
    const bar = document.getElementById(`sim-${key === 'elec' ? 'elec' : key === 'water' ? 'water' : key}-bar`);
    const lbl = document.getElementById(`sim-${key === 'elec' ? 'elec' : key === 'water' ? 'water' : key}-pct`);
    if (bar) bar.style.width = pct + '%';
    if (lbl) lbl.textContent = `−${pct}%`;
  });
  // fix naming
  ['elec','water','paper','clean'].forEach(key => {
    const bar = document.getElementById(`sim-${key}-bar`);
    const lbl = document.getElementById(`sim-${key}-pct`);
    if (bar) bar.style.width = reds[key] + '%';
    if (lbl) lbl.textContent = `−${reds[key]}%`;
  });

  // Mini bars on right panel
  ['elec','water','paper','clean'].forEach(key => {
    const pct = reds[key];
    const bar = document.getElementById(`sim-mini-${key}-bar`);
    const lbl = document.getElementById(`sim-mini-${key}-pct`);
    if (bar) bar.style.width = Math.min(100, pct) + '%';
    if (lbl) lbl.textContent = `−${pct}%`;
  });

  // Absolute values
  const units = { elec:'kWh', water:'L', paper:'paquets', clean:'rotllos' };
  ['elec','water','paper','clean'].forEach(key => {
    const baseVal = base[key];
    const reduction = reds[key] / 100;
    const newVal = Math.round(baseVal * (1 - reduction));
    const saved  = baseVal - newVal;
    const absEl  = document.getElementById(`sim-abs-${key}`);
    const saveEl = document.getElementById(`sim-abs-${key}-save`);
    if (absEl) absEl.textContent = `${newVal.toLocaleString('ca-ES')} ${units[key]}`;
    if (saveEl) {
      if (saved > 0) {
        saveEl.textContent = `−${saved.toLocaleString('ca-ES')} estalviats`;
        saveEl.style.color = 'var(--green)';
      } else {
        saveEl.textContent = `sense canvis`;
        saveEl.style.color = 'var(--muted)';
      }
    }
  });

  // Scenario message
  const total = SIM_MEASURES.filter(m => document.getElementById(m.id)?.checked).length;
  const total_all = SIM_MEASURES.length;
  const msg = document.getElementById('sim-scenario-text');
  if (msg) {
    if (total === 0) msg.textContent = `No measures active. Consumption unchanged.`;
    else if (total === total_all) msg.textContent = `All measures active. Maximum reduction: −${avg}% average.`;
    else msg.textContent = `${total} of ${total_all} active measures. Average reduction: −${avg}%.`;
  }

  // Update compare charts dynamically
  updateSimCompareCharts(base, reds);
}

function updateSimCompareCharts(base, reds) {
  if (!hasChartLib()) return;
  const baseE = base.elec;
  const baseA = Math.round(base.water / 1000); // kL
  const baseO = base.paper;
  const baseN = base.clean;

  const redE = Math.round(baseE * (1 - reds.elec / 100));
  const redA = Math.round(baseA * (1 - reds.water / 100));
  const redO = Math.round(baseO * (1 - reds.paper / 100));
  const redN = Math.round(baseN * (1 - reds.clean / 100));

  // Compare chart
  const ctxC = document.getElementById('chart-compare')?.getContext('2d');
  if (ctxC) {
    if (charts['compare']) charts['compare'].destroy();
    charts['compare'] = new Chart(ctxC, {
      type: 'bar',
      data: {
        labels: ['⚡ Elèc (kWh÷10)', '💧 Water (kL)', '📝 Paper', '🧼 Cleaning'],
        datasets: [
          { label:'Current baseline', data:[Math.round(baseE/10),baseA,baseO,baseN], backgroundColor:'rgba(90,122,150,.5)', borderRadius:5 },
          { label:'Simulated scenario', data:[Math.round(redE/10),redA,redO,redN], backgroundColor:'rgba(52,211,153,.65)', borderRadius:5 },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:'#94afc8',font:{size:10},boxWidth:10}},
          tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}`}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10}}},
          y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'}}}
        }
      }
    });
  }

  // 3-year savings line
  const ctxS = document.getElementById('chart-savings3y')?.getContext('2d');
  if (ctxS) {
    if (charts['savings3y']) charts['savings3y'].destroy();
    // Year 1: only y1 measures, Year 2: y1+y2, Year 3: all
    const y1Ids = ['cb-sensors','cb-airejadors','cb-zeropaper','cb-assecadors'];
    const y2Ids = ['cb-led','cb-cisternes','cb-recarregables','cb-granel'];
    const y3Ids = ['cb-solar','cb-pluvials','cb-digitalitzacio','cb-ecologics'];

    function yearSavingKWh(yearIds) {
      let rem = 1;
      [...y1Ids,...y2Ids,...y3Ids].slice(0, yearIds.length).forEach(id => {
        const m = SIM_MEASURES.find(x=>x.id===id);
        const cb = document.getElementById(id);
        if (m && cb && cb.checked) rem *= (1 - m.pct/100);
      });
      return Math.round(baseE * (1 - rem));
    }

    // simpler approach: cumulative per year
    function cumSavingKWh(year) {
      const ids = year===1 ? y1Ids : year===2 ? [...y1Ids,...y2Ids] : [...y1Ids,...y2Ids,...y3Ids];
      let rem = 1;
      ids.forEach(id => {
        const m = SIM_MEASURES.find(x=>x.id===id);
        const cb = document.getElementById(id);
        if (m && cb && cb.checked && m.resource==='elec') rem *= (1 - m.pct/100);
      });
      return Math.round(baseE * (1 - rem));
    }

    charts['savings3y'] = new Chart(ctxS, {
      type: 'line',
      data: {
        labels: ['Year 1','Year 2','Year 3'],
        datasets: [
          { label:'Electrical savings (kWh)', data:[cumSavingKWh(1),cumSavingKWh(2),cumSavingKWh(3)],
            borderColor:'#34d399', backgroundColor:'rgba(52,211,153,.12)', fill:true, tension:.3, pointRadius:6, pointBackgroundColor:'#34d399' },
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins:{
          legend:{labels:{color:'#94afc8',font:{size:10},boxWidth:10}},
          tooltip:{callbacks:{label:c=>` ${c.parsed.y.toLocaleString('ca-ES')} kWh saved`}}
        },
        scales:{
          x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10}}},
          y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#5a7a96',font:{size:10,family:'JetBrains Mono'},callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v},min:0}
        }
      }
    });
  }
}

function simSetAll(state) {
  document.querySelectorAll('.sim-cb').forEach(cb => { cb.checked = state; });
  updateSimulator();
}

// Attach events to all checkboxes
function initSimulator() {
  initSimDonut();
  document.querySelectorAll('.sim-cb').forEach(cb => {
    cb.addEventListener('change', updateSimulator);
  });
  updateSimulator();
}

// ─── MY DATA (custom inputs) ─────────────────────────────
const MYDATA_LIMITS = {
  elec:  { min: 1,   max: 5000,  id: 'my-elec-daily',    errId: 'err-elec'  },
  water: { min: 10,  max: 50000, id: 'my-water-daily',   errId: 'err-water' },
  paper: { min: 0.5, max: 500,   id: 'my-paper-monthly', errId: 'err-paper' },
  clean: { min: 1,   max: 2000,  id: 'my-clean-monthly', errId: 'err-clean' },
};

const DEFAULT_DATA_BACKUP = {
  elecDaily:    261.54,
  waterDaily:   850,
  paperMonthly: 22.5,
  cleanMonthly: 108,
  elecFactors:  [1.15,1.18,1.05,0.92,0.88,0.80,0.75,0.78,0.90,1.02,1.12,1.20],
  waterFactors: [0.80,0.82,0.88,0.95,1.05,1.15,1.20,1.18,1.05,0.95,0.85,0.78],
};

let mydCurrentPeriod = 'anual';

// Clamp a value and enforce min/max
function clampInput(input, min, max) {
  let v = parseFloat(input.value);
  if (isNaN(v) || input.value === '') return null;
  if (v < min) { input.value = min; v = min; }
  if (v > max) { input.value = max; v = max; }
  return v;
}

function validateField(key) {
  const cfg = MYDATA_LIMITS[key];
  const input = document.getElementById(cfg.id);
  const errEl = document.getElementById(cfg.errId);
  const raw = input.value.trim();
  if (raw === '') {
    input.classList.remove('is-valid','is-error');
    if (errEl) errEl.hidden = true;
    return null; // blank = use default
  }
  let v = parseFloat(raw);
  if (isNaN(v)) {
    input.classList.add('is-error'); input.classList.remove('is-valid');
    if (errEl) { errEl.querySelector('span').textContent = 'Must be a number.'; errEl.hidden = false; }
    return 'error';
  }
  if (v < cfg.min || v > cfg.max) {
    // Auto-clamp
    v = Math.max(cfg.min, Math.min(cfg.max, v));
    input.value = v;
    if (errEl) { errEl.querySelector('span').textContent = `Clamped to valid range (${cfg.min}–${cfg.max}).`; errEl.hidden = false; }
    input.classList.remove('is-error'); input.classList.add('is-valid');
    return v;
  }
  input.classList.add('is-valid'); input.classList.remove('is-error');
  if (errEl) errEl.hidden = true;
  return v;
}

// Live validation on input
Object.keys(MYDATA_LIMITS).forEach(key => {
  const input = document.getElementById(MYDATA_LIMITS[key].id);
  if (!input) return;
  input.addEventListener('input', () => validateField(key));
  input.addEventListener('blur',  () => validateField(key));
});

function parseFactors(str) {
  if (!str || !str.trim()) return null;
  const vals = str.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
  if (vals.length !== 12) return 'err-count';
  if (vals.some(v => v < 0.1 || v > 3.0)) return 'err-range';
  return vals;
}

function validateFactors(inputId, errId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errId);
  const raw = input.value.trim();
  if (!raw) { if (errEl) errEl.hidden = true; return null; }
  const result = parseFactors(raw);
  if (result === 'err-count') {
    if (errEl) { errEl.querySelector('span').textContent = 'Exactly 12 comma-separated values required.'; errEl.hidden = false; }
    input.style.borderColor = 'rgba(248,113,113,.6)';
    return 'error';
  }
  if (result === 'err-range') {
    if (errEl) { errEl.querySelector('span').textContent = 'All values must be between 0.1 and 3.0.'; errEl.hidden = false; }
    input.style.borderColor = 'rgba(248,113,113,.6)';
    return 'error';
  }
  if (errEl) errEl.hidden = true;
  input.style.borderColor = 'rgba(52,211,153,.5)';
  return result;
}

function mydComputeAndRender(period, myVals) {
  // myVals: { elecDaily, waterDaily, paperMonthly, cleanMonthly, elecFactors, waterFactors }
  // Uses ONLY myVals — never touches the global DATA object
  const fmt = n => Math.round(n).toLocaleString('ca-ES');

  const elecD  = myVals.elecDaily;
  const waterD = myVals.waterDaily;
  const paperM = myVals.paperMonthly;
  const cleanM = myVals.cleanMonthly;

  // Annual totals
  const elecAny  = Math.round(elecD  * 365);
  const waterAny = Math.round(waterD * 365);
  const paperAny = Math.round(paperM * 12);
  const cleanAny = Math.round(cleanM * 12);

  // KPI row (always annual)
  document.getElementById('myd-elec-year').textContent  = fmt(elecAny);
  document.getElementById('myd-water-year').textContent = fmt(waterAny);
  document.getElementById('myd-paper-year').textContent = fmt(paperAny);
  document.getElementById('myd-clean-year').textContent = fmt(cleanAny);

  // Period-based
  const P = PERIOD_CONFIG[period] || PERIOD_CONFIG.anual;

  // Seasonal factor for electricity & water using provided factors
  const elecSF  = myVals.elecFactors.reduce((s,v,i) => s + v * DAYS_PER_MONTH[i], 0) / 365;
  const waterSF = myVals.waterFactors.reduce((s,v,i) => s + v * DAYS_PER_MONTH[i], 0) / 365;

  const elecPer  = Math.round(elecD  * P.electricitat.days * P.electricitat.sf);
  const waterPer = Math.round(waterD * P.aigua.days         * P.aigua.sf);
  const paperPer = Math.round(paperM * P.oficina.months     * P.oficina.sf);
  const cleanPer = Math.round(cleanM * P.neteja.months      * P.neteja.sf);

  document.getElementById('myd-res-elec-any').textContent  = fmt(elecAny);
  document.getElementById('myd-res-elec-per').textContent  = fmt(elecPer);
  document.getElementById('myd-res-water-any').textContent = fmt(waterAny);
  document.getElementById('myd-res-water-per').textContent = fmt(waterPer);
  document.getElementById('myd-res-paper-any').textContent = fmt(paperAny);
  document.getElementById('myd-res-paper-per').textContent = fmt(paperPer);
  document.getElementById('myd-res-clean-any').textContent = fmt(cleanAny);
  document.getElementById('myd-res-clean-per').textContent = fmt(cleanPer);

  // −30% savings
  document.getElementById('myd-save-elec').textContent  = fmt(Math.round(elecAny  * 0.30));
  document.getElementById('myd-save-water').textContent = fmt(Math.round(waterAny * 0.30));
  document.getElementById('myd-save-paper').textContent = fmt(Math.round(paperAny * 0.30));
  document.getElementById('myd-save-clean').textContent = fmt(Math.round(cleanAny * 0.30));

  // Period label
  const periodLabels = { anual:'12 months (full year)', curs:'10 months (Sep–Jun)', hivern:'3 months (Dec–Feb)' };
  const lbl = document.getElementById('myd-period-label');
  if (lbl) lbl.textContent = periodLabels[period] || '';
}

// Store the last applied values so period changes can re-render
let mydLastVals = null;

function mydSetPeriod(btn, period) {
  document.querySelectorAll('[data-myd-period]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  mydCurrentPeriod = period;
  if (mydLastVals) mydComputeAndRender(period, mydLastVals);
}

function applyMyData() {
  // Validate all fields
  const elecVal  = validateField('elec');
  const waterVal = validateField('water');
  const paperVal = validateField('paper');
  const cleanVal = validateField('clean');
  const elecF    = validateFactors('my-elec-factors', 'err-elec-f');
  const waterF   = validateFactors('my-water-factors', 'err-water-f');

  if ([elecVal, waterVal, paperVal, cleanVal, elecF, waterF].includes('error')) {
    document.getElementById('mydata-status').textContent = '⚠️ Fix the errors above before applying.';
    document.getElementById('mydata-status').style.color = 'var(--red)';
    return;
  }

  // Build a standalone values object — never mutate the global DATA
  const myVals = {
    elecDaily:    elecVal  !== null ? elecVal  : DEFAULT_DATA_BACKUP.elecDaily,
    waterDaily:   waterVal !== null ? waterVal : DEFAULT_DATA_BACKUP.waterDaily,
    paperMonthly: paperVal !== null ? paperVal : DEFAULT_DATA_BACKUP.paperMonthly,
    cleanMonthly: cleanVal !== null ? cleanVal : DEFAULT_DATA_BACKUP.cleanMonthly,
    elecFactors:  Array.isArray(elecF)  ? elecF  : [...DEFAULT_DATA_BACKUP.elecFactors],
    waterFactors: Array.isArray(waterF) ? waterF : [...DEFAULT_DATA_BACKUP.waterFactors],
  };
  mydLastVals = myVals;

  // Count how many custom values were entered
  const count = [elecVal, waterVal, paperVal, cleanVal].filter(v => v !== null).length;

  // Show inline results
  const resultsEl = document.getElementById('mydata-results');
  if (resultsEl) { resultsEl.hidden = false; resultsEl.style.display = 'flex'; }
  mydComputeAndRender(mydCurrentPeriod, myVals);

  // Status message
  const statusEl = document.getElementById('mydata-status');
  statusEl.style.color = 'var(--green)';
  statusEl.textContent = count > 0
    ? `✅ ${count} custom value${count > 1 ? 's' : ''} applied — results shown below`
    : '✅ Using all default values — results shown below';

  // NOTE: handleCalc() is intentionally NOT called here.
  // My Data is fully independent from the Calculator tab.
}

function resetMyData() {
  mydLastVals = null;

  ['my-elec-daily','my-water-daily','my-paper-monthly','my-clean-monthly','my-elec-factors','my-water-factors'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('is-valid','is-error'); el.style.borderColor = ''; }
  });
  ['err-elec','err-water','err-paper','err-clean','err-elec-f','err-water-f'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  const resultsEl = document.getElementById('mydata-results');
  if (resultsEl) { resultsEl.hidden = true; resultsEl.style.display = ''; }

  const statusEl = document.getElementById('mydata-status');
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = '↩ Cleared — enter new values and click Apply & Calculate';

  // NOTE: handleCalc() is intentionally NOT called here.
  // Resetting My Data does NOT affect the Calculator tab.
}

document.getElementById('btn-apply-mydata').addEventListener('click', applyMyData);
document.getElementById('btn-reset-mydata').addEventListener('click', resetMyData);

// ─── INIT ────────────────────────────────────────────────
// Set default dates for custom range
const today = new Date();
const sixMonths = new Date(today); sixMonths.setMonth(sixMonths.getMonth()+6);
document.getElementById('date-from').value = toLocalISODate(today);
document.getElementById('date-to').value   = toLocalISODate(sixMonths);

handleCalc();
initSimulator();

// ─── AMBIENT PARTICLE SYSTEM ─────────────────────────────
(function() {
  const canvas = document.getElementById('ambient-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];

  const TYPES = [
    { color: 'rgba(251,191,36,',  symbol: '⚡', size: [6,11],  speed: [.18,.4],  count: 6  },
    { color: 'rgba(56,189,248,',  symbol: '💧', size: [4,9],   speed: [.12,.28], count: 9  },
    { color: 'rgba(167,139,250,', symbol: '○',  size: [3,7],   speed: [.1,.22],  count: 8  },
    { color: 'rgba(52,211,153,',  symbol: '✦',  size: [4,10],  speed: [.14,.32], count: 7  },
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle(type, force) {
    return {
      type,
      x: rand(0, W),
      y: force ? rand(0, H) : H + rand(10, 50),
      size: rand(type.size[0], type.size[1]),
      speed: rand(type.speed[0], type.speed[1]),
      opacity: rand(.12, .35),
      drift: rand(-.3, .3),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(.005, .018),
      life: 0,
      maxLife: rand(280, 520),
    };
  }

  function initParticles() {
    particles = [];
    TYPES.forEach(t => {
      for (let i = 0; i < t.count; i++) {
        particles.push(createParticle(t, true));
      }
    });
  }

  function drawParticle(p) {
    const fade = Math.min(1, Math.min(p.life / 40, (p.maxLife - p.life) / 40));
    ctx.save();
    ctx.globalAlpha = p.opacity * fade;
    ctx.font = `${p.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // For symbols use text, for circles draw shape
    if (p.type.symbol === '○') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.strokeStyle = p.type.color + '.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (p.type.symbol === '✦') {
      // draw a 4-point star
      const s = p.size / 2;
      ctx.fillStyle = p.type.color + '.8)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const r = i % 2 === 0 ? s : s * .4;
        if (i === 0) ctx.moveTo(p.x + r * Math.cos(angle), p.y + r * Math.sin(angle));
        else ctx.lineTo(p.x + r * Math.cos(angle), p.y + r * Math.sin(angle));
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillText(p.type.symbol, p.x, p.y);
    }
    ctx.restore();
  }

  let raf;
  function tick() {
    ctx.clearRect(0, 0, W, H);

    particles.forEach((p, i) => {
      p.wobble += p.wobbleSpeed;
      p.x += p.drift + Math.sin(p.wobble) * .4;
      p.y -= p.speed;
      p.life++;

      drawParticle(p);

      if (p.life >= p.maxLife || p.y < -30) {
        const t = TYPES[Math.floor(Math.random() * TYPES.length)];
        particles[i] = createParticle(t, false);
      }
    });

    raf = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => { resize(); initParticles(); });
  resize();
  initParticles();
  tick();

  // Pause when tab not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else tick();
  });
})();

// ─── TOAST SYSTEM ───────────────────────────────────────
(function() {
  const toast = document.getElementById('itb-toast');
  const msg   = document.getElementById('toast-msg');
  let timer;

  function showToast(text, duration = 2800) {
    if (!toast) return;
    msg.textContent = text;
    toast.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  // Show toast on tab switch
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const labels = {
        calculadora: "🌿 Consumption Calculator",
        grafics:     "📊 Data Visualization",
        pla:         "🗺️ Reduction Plan",
        simulador:   '🔬 Simulador d\'estalvi',
        consells:    "💡 Practical Tips",
        mydata:      "✏️ My Custom Data",
      };
      const key = tab.dataset.tab;
      if (labels[key]) showToast(labels[key]);
    });
  });

  // Show toast on calc button
  const calcBtn = document.querySelector('.btn-primary');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      showToast('✅ Results updated!');
    });
  }
})();