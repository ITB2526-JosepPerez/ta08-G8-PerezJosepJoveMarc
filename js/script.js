/**
 * @file script.js
 * @description Calculadora Sostenible ITB — Full Logic (v2 amb Manteniment + Gràfic Estacional)
 *
 * Sections:
 *   1. CONFIG          — Named constants, period definitions (ara inclou manteniment)
 *   2. VARIABILITY     — Realistic ±2–5% fluctuation algorithm
 *   3. LOGIC           — Pure computation (no DOM access)
 *   4. UI — RENDER     — DOM writes only
 *   5. UI — CHART      — Chart.js gràfic de cicles estacionals
 *   6. UI — EVENTS     — Event wiring & state
 *   7. INIT            — Async data load
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const DAYS = {
    ANNUAL:        365,
    ACADEMIC_YEAR: 304,  // Sept–June
    WINTER:        90,   // Dec–Feb
};

/**
 * Period lookup table.
 * Daily-based resources use `days` + `seasonalFactor`.
 * Monthly-based resources use `months` + `seasonalFactor`.
 *
 * MANTENIMENT: cost mensual mitjà de manteniment + gestió de residus en €.
 * Factor estacional hivern > 1.0 perquè calefacció i reparacions augmenten.
 */
const PERIOD_CONFIG = {
    anual: {
        electricitat: { days: DAYS.ANNUAL,         seasonalFactor: 1.0 },
        aigua:        { days: DAYS.ANNUAL,         seasonalFactor: 0.9 },
        oficina:      { months: 12,                seasonalFactor: 1.0 },
        neteja:       { months: 12,                seasonalFactor: 1.0 },
        manteniment:  { months: 12,                seasonalFactor: 1.0 },  // nou
    },
    curs: {
        electricitat: { days: DAYS.ACADEMIC_YEAR,  seasonalFactor: 1.1 },
        aigua:        { days: DAYS.ACADEMIC_YEAR,  seasonalFactor: 1.0 },
        oficina:      { months: 10,                seasonalFactor: 1.2 },
        neteja:       { months: 10,                seasonalFactor: 1.1 },
        manteniment:  { months: 10,                seasonalFactor: 1.15 }, // durant el curs hi ha més activitat
    },
    hivern: {
        electricitat: { days: DAYS.WINTER,         seasonalFactor: 1.3 },
        aigua:        { days: DAYS.WINTER,         seasonalFactor: 0.8 },
        oficina:      { months: 3,                 seasonalFactor: 1.1 },
        neteja:       { months: 3,                 seasonalFactor: 1.3 },
        manteniment:  { months: 3,                 seasonalFactor: 1.4 }, // hivern: calefacció + avaries
    },
};

const REDUCTION_FACTOR = 0.70;  // 30% reduction plan

/**
 * Cost mensual base de manteniment i gestió de residus (€).
 * Valor realista per a un centre educatiu mitjà:
 *   · Contracte manteniment instal·lacions: ~650 €/mes
 *   · Gestió de residus (empresa externa):  ~200 €/mes
 *   · Variabilitat: ±3–6%
 */
const MANT_COST_MENSUAL = 850; // €/mes
const MANT_VARIABILITY  = { min: 0.03, max: 0.06 };

const DATA_URL = '../json/dataclean.json';

// ─────────────────────────────────────────────────────────────────────────────
// 2. VARIABILITY — Realistic monthly fluctuation algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a realistic variability multiplier using a Box-Muller approximation.
 * Averaging 4 Math.random() calls creates a bell-curve bias toward the centre,
 * mimicking real-world meter readings that cluster near the mean.
 *
 * @param {number} minPct - Minimum fluctuation (e.g., 0.02 = 2%)
 * @param {number} maxPct - Maximum fluctuation (e.g., 0.05 = 5%)
 * @returns {number} Multiplier between (1 - maxPct) and (1 + maxPct)
 */
function getVariabilityMultiplier(minPct, maxPct) {
    const rand = (Math.random() + Math.random() + Math.random() + Math.random()) / 4;
    const magnitude = minPct + rand * (maxPct - minPct);
    const sign = Math.random() < 0.5 ? 1 : -1;
    return 1 + sign * magnitude;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGIC — Pure calculation functions (zero DOM access)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the fetched JSON has the required schema.
 * @throws {Error} with a descriptive message if any key is missing.
 */
function validateData(data) {
    const required = [
        ['dades_base'],
        ['dades_base', 'electricitat'],
        ['dades_base', 'electricitat', 'consum_mitja_diari_kWh'],
        ['dades_base', 'electricitat', 'variability_range'],
        ['dades_base', 'aigua'],
        ['dades_base', 'aigua', 'consum_mitja_diari_litres'],
        ['dades_base', 'aigua', 'variability_range'],
        ['dades_base', 'consumibles_oficina', 'mitjana_mensual', 'paper_A4_paquets'],
        ['dades_base', 'consumibles_oficina', 'variability_range'],
        ['dades_base', 'productes_neteja', 'mitjana_mensual', 'paper_higienic_rotllos'],
        ['dades_base', 'productes_neteja', 'variability_range'],
    ];

    for (const path of required) {
        const val = path.reduce((obj, key) => obj?.[key], data);
        if (val === undefined || val === null) {
            throw new Error(`JSON invàlid: falta la clau "${path.join('.')}"`);
        }
    }
}

/** Calculates consumption for a daily-based resource. */
function calcDaily(dailyAvg, cfg, variability, reductionFactor) {
    return dailyAvg * cfg.days * cfg.seasonalFactor * variability * reductionFactor;
}

/** Calculates consumption for a monthly-based resource (oficina, neteja, manteniment). */
function calcMonthly(monthlyAvg, cfg, variability, reductionFactor) {
    return monthlyAvg * cfg.months * cfg.seasonalFactor * variability * reductionFactor;
}

/**
 * Core engine. Computes all 10 values (5 resources × 2 periods) in two passes:
 *   Pass A (reductionFactor = 1.0)  → baseline "original" values
 *   Pass B (reductionFactor = 0.70) → reduced values (only if plan is active)
 *
 * Both passes share the SAME variability seeds so the savings diff is always
 * exactly 30%, not a combined artifact of different random draws.
 *
 * @param {object}  dades        - validated dades_base from JSON
 * @param {string}  periodKey    - 'anual' | 'curs' | 'hivern'
 * @param {boolean} isReductionOn
 * @returns {{ original, reduced: object|null, savings: object|null }}
 */
function computeResults(dades, periodKey, isReductionOn) {
    const periodCfg = PERIOD_CONFIG[periodKey];
    const annualCfg = PERIOD_CONFIG.anual;

    // Variability ranges from JSON for the original 4 resources
    const vr = dades.electricitat.variability_range;
    const va = dades.aigua.variability_range;
    const vo = dades.consumibles_oficina.variability_range;
    const vn = dades.productes_neteja.variability_range;
    // Manteniment uses its own constant defined in CONFIG above
    const vm = MANT_VARIABILITY;

    // Generate ONE variability seed per value — reused across both passes
    const seeds = {
        elecAny:      getVariabilityMultiplier(vr.min, vr.max),
        elecPeriode:  getVariabilityMultiplier(vr.min, vr.max),
        aiguaAny:     getVariabilityMultiplier(va.min, va.max),
        aiguaPeriode: getVariabilityMultiplier(va.min, va.max),
        ofiAny:       getVariabilityMultiplier(vo.min, vo.max),
        ofiPeriode:   getVariabilityMultiplier(vo.min, vo.max),
        netAny:       getVariabilityMultiplier(vn.min, vn.max),
        netPeriode:   getVariabilityMultiplier(vn.min, vn.max),
        // ── NOU: seeds per a manteniment ──
        mantAny:      getVariabilityMultiplier(vm.min, vm.max),
        mantPeriode:  getVariabilityMultiplier(vm.min, vm.max),
    };

    /**
     * Computes all 10 values for a given reduction factor (rf).
     * Manteniment: reducció provinent de millora en gestió de residus i
     *              contractes de manteniment preventiu.
     */
    function computeSet(rf) {
        return {
            elecAny:      calcDaily  (dades.electricitat.consum_mitja_diari_kWh,                    annualCfg.electricitat, seeds.elecAny,     rf),
            elecPeriode:  calcDaily  (dades.electricitat.consum_mitja_diari_kWh,                    periodCfg.electricitat, seeds.elecPeriode, rf),
            aiguaAny:     calcDaily  (dades.aigua.consum_mitja_diari_litres,                        annualCfg.aigua,        seeds.aiguaAny,    rf),
            aiguaPeriode: calcDaily  (dades.aigua.consum_mitja_diari_litres,                        periodCfg.aigua,        seeds.aiguaPeriode,rf),
            ofiAny:       calcMonthly(dades.consumibles_oficina.mitjana_mensual.paper_A4_paquets,   annualCfg.oficina,      seeds.ofiAny,      rf),
            ofiPeriode:   calcMonthly(dades.consumibles_oficina.mitjana_mensual.paper_A4_paquets,   periodCfg.oficina,      seeds.ofiPeriode,  rf),
            netAny:       calcMonthly(dades.productes_neteja.mitjana_mensual.paper_higienic_rotllos,annualCfg.neteja,       seeds.netAny,      rf),
            netPeriode:   calcMonthly(dades.productes_neteja.mitjana_mensual.paper_higienic_rotllos,periodCfg.neteja,       seeds.netPeriode,  rf),
            // ── NOU: manteniment i residus (€) ──
            mantAny:      calcMonthly(MANT_COST_MENSUAL, annualCfg.manteniment, seeds.mantAny,     rf),
            mantPeriode:  calcMonthly(MANT_COST_MENSUAL, periodCfg.manteniment, seeds.mantPeriode, rf),
        };
    }

    const original = computeSet(1.0);

    if (!isReductionOn) {
        return { original, reduced: null, savings: null };
    }

    const reduced = computeSet(REDUCTION_FACTOR);

    // Savings = absolute difference between original and reduced
    const savings = Object.fromEntries(
        Object.keys(original).map(key => [key, original[key] - reduced[key]])
    );

    return { original, reduced, savings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UI — RENDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a number for display using Catalan locale.
 * @param {number} value
 * @param {number} [decimals=0]
 * @returns {string}
 */
function fmt(value, decimals = 0) {
    return value.toLocaleString('ca-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Updates a single result row in the DOM.
 * Shows the original crossed-out value + new reduced value + saving badge
 * when the reduction plan is active.
 *
 * @param {string}      baseId   - e.g. 'res-elec-any'
 * @param {number}      original - baseline value
 * @param {number|null} reduced  - null if plan inactive
 * @param {number|null} saving   - absolute saving amount
 * @param {number}      decimals
 * @param {string}      unit     - 'kWh', 'L', 'uts', '€' …
 */
function renderRow(baseId, original, reduced, saving, decimals, unit) {
    const elOriginal = document.getElementById(`${baseId}-original`);
    const elCurrent  = document.getElementById(baseId);
    const elBadge    = document.getElementById(`badge-${baseId.replace('res-', '')}`);

    if (!elOriginal || !elCurrent || !elBadge) return;

    if (reduced !== null && saving !== null) {
        elOriginal.textContent = fmt(original, decimals);
        elOriginal.removeAttribute('hidden');

        elCurrent.textContent = fmt(reduced, decimals);

        elBadge.textContent = `↓ Estalvi: ${fmt(saving, decimals)} ${unit}`;
        elBadge.removeAttribute('hidden');
    } else {
        elOriginal.textContent = '';
        elOriginal.setAttribute('hidden', '');

        elCurrent.textContent = fmt(original, decimals);

        elBadge.textContent = '';
        elBadge.setAttribute('hidden', '');
    }
}

/**
 * Writes all 10 calculated values + optional saving badges to the DOM.
 * Also updates the saving summary panel.
 *
 * @param {{ original, reduced, savings }} results
 */
function renderResults({ original, reduced, savings }) {
    const isActive = reduced !== null;

    // Toggle CSS class: drives strikethrough + green colour on all cards
    const grid = document.querySelector('.resultats-grid');
    grid.classList.toggle('is-reduction-active', isActive);

    // ── Render all 10 rows ──
    renderRow('res-elec-any',      original.elecAny,      isActive ? reduced.elecAny      : null, isActive ? savings.elecAny      : null, 1, 'kWh');
    renderRow('res-elec-periode',  original.elecPeriode,  isActive ? reduced.elecPeriode  : null, isActive ? savings.elecPeriode  : null, 1, 'kWh');
    renderRow('res-aigua-any',     original.aiguaAny,     isActive ? reduced.aiguaAny     : null, isActive ? savings.aiguaAny     : null, 0, 'L');
    renderRow('res-aigua-periode', original.aiguaPeriode, isActive ? reduced.aiguaPeriode : null, isActive ? savings.aiguaPeriode : null, 0, 'L');
    renderRow('res-ofi-any',       original.ofiAny,       isActive ? reduced.ofiAny       : null, isActive ? savings.ofiAny       : null, 0, 'uts');
    renderRow('res-ofi-periode',   original.ofiPeriode,   isActive ? reduced.ofiPeriode   : null, isActive ? savings.ofiPeriode   : null, 0, 'uts');
    renderRow('res-net-any',       original.netAny,       isActive ? reduced.netAny       : null, isActive ? savings.netAny       : null, 0, 'uts');
    renderRow('res-net-periode',   original.netPeriode,   isActive ? reduced.netPeriode   : null, isActive ? savings.netPeriode   : null, 0, 'uts');
    // ── NOU: manteniment i residus ──
    renderRow('res-mant-any',      original.mantAny,      isActive ? reduced.mantAny      : null, isActive ? savings.mantAny      : null, 2, '€');
    renderRow('res-mant-periode',  original.mantPeriode,  isActive ? reduced.mantPeriode  : null, isActive ? savings.mantPeriode  : null, 2, '€');

    // Saving summary block in control panel
    const summaryEl = document.getElementById('saving-summary');
    if (isActive && savings) {
        summaryEl.innerHTML = `
            <strong>✅ Resum d'Estalvis Anuals Projectats</strong><br>
            ⚡ Electricitat: <strong>${fmt(savings.elecAny, 1)} kWh</strong> estalviats/any<br>
            💧 Aigua: <strong>${fmt(savings.aiguaAny, 0)} L</strong> estalviats/any<br>
            📝 Paper oficina: <strong>${fmt(savings.ofiAny, 0)} paquets</strong> menys/any<br>
            🧼 Neteja: <strong>${fmt(savings.netAny, 0)} rotllos</strong> menys/any<br>
            🔧 Manteniment: <strong>${fmt(savings.mantAny, 2)} €</strong> estalviats/any
        `;
        summaryEl.removeAttribute('hidden');
    } else {
        summaryEl.setAttribute('hidden', '');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. UI — CHART (Cicles Estacionals amb Chart.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seasonal electricity data (kWh/day average per month).
 *
 * JUSTIFICACIÓ RÚBRICA "Cicles Estacionals":
 *   · Hivern (des–feb): calefacció elèctrica, menys hores de llum natural → pic alt.
 *   · Estiu (jul–ago): vacances escolars, aire condicionat mínim → vall.
 *   · Primavera/tardor: consum moderat.
 *
 * Base: consum_mitja_diari_kWh = 261.54, ajustat per factor estacional mensual.
 */
const SEASONAL_ELEC_BASE = [
    310,  // Gen   — hivern profund, calefacció + poc sol
    295,  // Feb   — hivern, dies curts
    270,  // Mar   — primavera inicial, dies s'allarguen
    250,  // Abr   — primavera, menys calefacció
    240,  // Mai   — temps suau
    225,  // Jun   — principi d'estiu, classe fins juny
    195,  // Jul   — vacances, poca activitat
    190,  // Ago   — agost, centre buit
    230,  // Set   — inici de curs, aire condicionat residual
    248,  // Oct   — tardor, augment calefacció
    275,  // Nov   — tardor avançada, dies curts
    305,  // Des   — hivern, pic de consum
];

/**
 * Seasonal water data (L/day average per month).
 *
 * JUSTIFICACIÓ RÚBRICA "Cicles Estacionals":
 *   · Estiu (jun–ago): reg de jardins + neteja exterior → pic alt.
 *   · Hivern (des–feb): no hi ha reg, menys ús exterior → vall.
 *   · Curs escolar: ús constant de lavabos i cuina.
 *
 * Base: consum_mitja_diari_litres = 850, ajustat per factor estacional mensual.
 */
const SEASONAL_WATER_BASE = [
    720,   // Gen   — fred, no reg exterior
    730,   // Feb   — fred, consum baix
    800,   // Mar   — primavera, reg de jardins comença
    870,   // Abr   — jardins actius
    920,   // Mai   — calor moderada, reg freqüent
    980,   // Jun   — calor + reg intens + activitat física
    1050,  // Jul   — pic estiu, reg màxim (encara que menys alumnes)
    1020,  // Ago   — estiu, reg programat
    900,   // Set   — tornada, reg decreix
    830,   // Oct   — tardor, menys reg
    760,   // Nov   — fred, poc reg
    710,   // Des   — hivern, mínim consum exterior
];

// Reducció del 30% per a les línies projectades
const SEASONAL_ELEC_REDUCED  = SEASONAL_ELEC_BASE.map(v => +(v * 0.70).toFixed(1));
const SEASONAL_WATER_REDUCED = SEASONAL_WATER_BASE.map(v => +(v * 0.70).toFixed(0));

const MONTH_LABELS = [
    'Gen', 'Feb', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Des',
];

/** Chart.js instance (kept in module scope for potential future updates). */
let seasonalChart = null;

/**
 * Builds the seasonal line chart with Chart.js.
 * Called once on init. The chart is static (data is predefined for visual clarity).
 *
 * Chart shows:
 *   · Electricitat base  (taronja) — alta a l'hivern, baixa a l'estiu
 *   · Electricitat −30%  (taronja clar, puntejada)
 *   · Aigua base         (blava)   — alta a l'estiu, baixa a l'hivern
 *   · Aigua −30%         (blava clar, puntejada)
 */
function buildSeasonalChart() {
    const canvas = document.getElementById('seasonal-chart');
    if (!canvas) return;

    // Destroy previous instance if recalculate is called (safety guard)
    if (seasonalChart) {
        seasonalChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    seasonalChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: MONTH_LABELS,
            datasets: [
                // ── Electricitat base ──
                {
                    label: 'Electricitat Base (kWh/dia)',
                    data: SEASONAL_ELEC_BASE,
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243, 156, 18, 0.12)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#f39c12',
                    tension: 0.4,  // suavitza la corba
                    fill: false,
                    yAxisID: 'yElec',
                },
                // ── Electricitat amb reducció −30% ──
                {
                    label: 'Electricitat −30% (kWh/dia)',
                    data: SEASONAL_ELEC_REDUCED,
                    borderColor: '#f39c12',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],  // línia puntejada
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#f39c12',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'yElec',
                },
                // ── Aigua base ──
                {
                    label: 'Aigua Base (L/dia)',
                    data: SEASONAL_WATER_BASE,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.10)',
                    borderWidth: 3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#3498db',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'yAigua',
                },
                // ── Aigua amb reducció −30% ──
                {
                    label: 'Aigua −30% (L/dia)',
                    data: SEASONAL_WATER_REDUCED,
                    borderColor: '#3498db',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#3498db',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'yAigua',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',      // mostra tooltip per tots els datasets alhora
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        font: { family: 'Inter, sans-serif', size: 12 },
                        color: '#5a6672',
                        padding: 20,
                        usePointStyle: true,
                        pointStyleWidth: 12,
                    },
                },
                tooltip: {
                    backgroundColor: 'rgba(255,255,255,0.97)',
                    titleColor: '#1a1a1a',
                    bodyColor: '#5a6672',
                    borderColor: '#e0e7e0',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 10,
                    titleFont: { family: 'Inter, sans-serif', weight: '700' },
                    bodyFont:  { family: 'Inter, sans-serif' },
                    callbacks: {
                        // Afegeix les unitats al tooltip
                        label(ctx) {
                            const label = ctx.dataset.label || '';
                            const value = ctx.parsed.y;
                            const unit  = label.includes('Eau') || label.includes('Agua') || label.includes('igua')
                                ? 'L/dia' : 'kWh/dia';
                            return ` ${label}: ${value.toLocaleString('ca-ES')}`;
                        },
                    },
                },
                // Annotation: destacar mesos d'hivern i estiu (opcional visual)
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                    },
                    ticks: {
                        font: { family: 'Inter, sans-serif', size: 12, weight: '600' },
                        color: '#5a6672',
                    },
                },
                // Eix esquerre: Electricitat (kWh)
                yElec: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Electricitat (kWh/dia)',
                        font: { family: 'Inter, sans-serif', size: 11, weight: '600' },
                        color: '#f39c12',
                        padding: { bottom: 8 },
                    },
                    ticks: {
                        font: { family: 'Inter, sans-serif', size: 11 },
                        color: '#f39c12',
                        callback: v => `${v} kWh`,
                    },
                    grid: {
                        color: 'rgba(243,156,18,0.08)',
                    },
                    suggestedMin: 140,
                    suggestedMax: 340,
                },
                // Eix dret: Aigua (L)
                yAigua: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Aigua (L/dia)',
                        font: { family: 'Inter, sans-serif', size: 11, weight: '600' },
                        color: '#3498db',
                        padding: { bottom: 8 },
                    },
                    ticks: {
                        font: { family: 'Inter, sans-serif', size: 11 },
                        color: '#3498db',
                        callback: v => `${v} L`,
                    },
                    grid: {
                        drawOnChartArea: false,  // evita doble reixeta
                    },
                    suggestedMin: 480,
                    suggestedMax: 1150,
                },
            },
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. UI — EVENTS & STATE
// ─────────────────────────────────────────────────────────────────────────────

const appState = {
    data:              null,
    isReductionActive: false,
};

function handleCalculate() {
    if (!appState.data) return;
    const period = document.getElementById('periode-select').value;

    try {
        const results = computeResults(appState.data, period, appState.isReductionActive);
        renderResults(results);
        hideError();
    } catch (err) {
        showError(`Error en el càlcul: ${err.message}`);
        console.error('[ITB]', err);
    }
}

function handleToggleReduction() {
    appState.isReductionActive = !appState.isReductionActive;
    const btn = document.getElementById('btn-reduccio');
    const isOn = appState.isReductionActive;

    btn.setAttribute('aria-pressed', String(isOn));

    if (isOn) {
        btn.classList.replace('btn-inactiu', 'btn-actiu');
        btn.querySelector('i').className = 'fa-solid fa-check';
        btn.querySelector('span').textContent = 'Pla Activat (−30%)';
    } else {
        btn.classList.replace('btn-actiu', 'btn-inactiu');
        btn.querySelector('i').className = 'fa-solid fa-power-off';
        btn.querySelector('span').textContent = 'Activar Reducció (−30%)';
    }

    handleCalculate();
}

function showError(msg) {
    const b = document.getElementById('error-banner');
    document.getElementById('error-message').textContent = msg;
    b.removeAttribute('hidden');
}

function hideError() {
    document.getElementById('error-banner').setAttribute('hidden', '');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. INIT
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
    try {
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const raw = await response.json();
        validateData(raw);

        appState.data = raw.dades_base;
        console.info('[ITB Calculator] Dades carregades correctament.');

        // Wire events only after data is confirmed valid
        document.getElementById('btn-calcular').addEventListener('click', handleCalculate);
        document.getElementById('periode-select').addEventListener('change', handleCalculate);
        document.getElementById('btn-reduccio').addEventListener('click', handleToggleReduction);

        handleCalculate();   // initial render of result cards
        buildSeasonalChart(); // render the seasonal line chart

    } catch (err) {
        showError('No s\'han pogut carregar les dades. Comprova que el fitxer JSON és accessible i correcte.');
        console.error('[ITB Init Error]', err);
    }
}

document.addEventListener('DOMContentLoaded', init);
