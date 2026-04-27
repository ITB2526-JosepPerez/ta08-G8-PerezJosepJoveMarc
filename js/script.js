/**
 * @file script.js
 * @description Calculadora Sostenible ITB — Full Logic
 *
 * Sections:
 *   1. CONFIG          — Named constants, period definitions
 *   2. VARIABILITY     — Realistic ±2–5% fluctuation algorithm
 *   3. LOGIC           — Pure computation (no DOM access)
 *   4. UI — RENDER     — DOM writes only
 *   5. UI — EVENTS     — Event wiring & state
 *   6. INIT            — Async data load
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
 */
const PERIOD_CONFIG = {
    anual: {
        electricitat: { days: DAYS.ANNUAL,         seasonalFactor: 1.0 },
        aigua:        { days: DAYS.ANNUAL,         seasonalFactor: 0.9 },
        oficina:      { months: 12,                seasonalFactor: 1.0 },
        neteja:       { months: 12,                seasonalFactor: 1.0 },
    },
    curs: {
        electricitat: { days: DAYS.ACADEMIC_YEAR,  seasonalFactor: 1.1 },
        aigua:        { days: DAYS.ACADEMIC_YEAR,  seasonalFactor: 1.0 },
        oficina:      { months: 10,                seasonalFactor: 1.2 },
        neteja:       { months: 10,                seasonalFactor: 1.1 },
    },
    hivern: {
        electricitat: { days: DAYS.WINTER,         seasonalFactor: 1.3 },
        aigua:        { days: DAYS.WINTER,         seasonalFactor: 0.8 },
        oficina:      { months: 3,                 seasonalFactor: 1.1 },
        neteja:       { months: 3,                 seasonalFactor: 1.3 },
    },
};

const REDUCTION_FACTOR = 0.70;  // 30% reduction plan
const DATA_URL = './json/dataclean.json';

// ─────────────────────────────────────────────────────────────────────────────
// 2. VARIABILITY — Realistic monthly fluctuation algorithm
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a realistic variability multiplier using a Box-Muller approximation
 * to produce a roughly normal distribution within the given percentage range.
 *
 * Instead of a flat uniform random (which feels too "jumpy"), averaging
 * multiple Math.random() calls creates a bell-curve bias toward the centre
 * — mimicking real-world meter readings that cluster near the mean.
 *
 * @param {number} minPct - Minimum fluctuation (e.g., 0.02 = 2%)
 * @param {number} maxPct - Maximum fluctuation (e.g., 0.05 = 5%)
 * @returns {number} Multiplier between (1 - maxPct) and (1 + maxPct)
 */
function getVariabilityMultiplier(minPct, maxPct) {
    // Average 4 samples → normal-ish distribution
    const rand = (Math.random() + Math.random() + Math.random() + Math.random()) / 4;

    // Map [0,1] → [minPct, maxPct]
    const magnitude = minPct + rand * (maxPct - minPct);

    // Randomly flip sign: fluctuation can be positive or negative
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

/**
 * Calculates consumption for a daily-based resource.
 * @param {number} dailyAvg
 * @param {{ days: number, seasonalFactor: number }} cfg
 * @param {number} variability - multiplier from getVariabilityMultiplier()
 * @param {number} reductionFactor - 1.0 or REDUCTION_FACTOR
 * @returns {number}
 */
function calcDaily(dailyAvg, cfg, variability, reductionFactor) {
    return dailyAvg * cfg.days * cfg.seasonalFactor * variability * reductionFactor;
}

/**
 * Calculates consumption for a monthly-based resource.
 * @param {number} monthlyAvg
 * @param {{ months: number, seasonalFactor: number }} cfg
 * @param {number} variability
 * @param {number} reductionFactor
 * @returns {number}
 */
function calcMonthly(monthlyAvg, cfg, variability, reductionFactor) {
    return monthlyAvg * cfg.months * cfg.seasonalFactor * variability * reductionFactor;
}

/**
 * Core engine. Computes all 8 values in two passes:
 *   Pass A (reductionFactor = 1.0)  → baseline "original" values
 *   Pass B (reductionFactor = 0.70) → reduced values (only computed if plan is active)
 *
 * Both passes share the SAME variability seeds so the diff is always
 * exactly 30% — not a combined artifact of different random draws.
 *
 * @param {object}  dades
 * @param {string}  periodKey
 * @param {boolean} isReductionOn
 * @returns {{ original: object, reduced: object|null, savings: object|null }}
 */
function computeResults(dades, periodKey, isReductionOn) {
    const periodCfg = PERIOD_CONFIG[periodKey];
    const annualCfg = PERIOD_CONFIG.anual;

    // Generate ONE variability value per resource, reused across both passes
    const vr = dades.electricitat.variability_range;
    const va = dades.aigua.variability_range;
    const vo = dades.consumibles_oficina.variability_range;
    const vn = dades.productes_neteja.variability_range;

    const seeds = {
        elecAny:      getVariabilityMultiplier(vr.min, vr.max),
        elecPeriode:  getVariabilityMultiplier(vr.min, vr.max),
        aiguaAny:     getVariabilityMultiplier(va.min, va.max),
        aiguaPeriode: getVariabilityMultiplier(va.min, va.max),
        ofiAny:       getVariabilityMultiplier(vo.min, vo.max),
        ofiPeriode:   getVariabilityMultiplier(vo.min, vo.max),
        netAny:       getVariabilityMultiplier(vn.min, vn.max),
        netPeriode:   getVariabilityMultiplier(vn.min, vn.max),
    };

    // Helper: compute all 8 values for a given reduction factor
    function computeSet(rf) {
        return {
            elecAny:      calcDaily(dades.electricitat.consum_mitja_diari_kWh,   annualCfg.electricitat, seeds.elecAny,      rf),
            elecPeriode:  calcDaily(dades.electricitat.consum_mitja_diari_kWh,   periodCfg.electricitat, seeds.elecPeriode,  rf),
            aiguaAny:     calcDaily(dades.aigua.consum_mitja_diari_litres,        annualCfg.aigua,        seeds.aiguaAny,     rf),
            aiguaPeriode: calcDaily(dades.aigua.consum_mitja_diari_litres,        periodCfg.aigua,        seeds.aiguaPeriode, rf),
            ofiAny:       calcMonthly(dades.consumibles_oficina.mitjana_mensual.paper_A4_paquets,       annualCfg.oficina,  seeds.ofiAny,   rf),
            ofiPeriode:   calcMonthly(dades.consumibles_oficina.mitjana_mensual.paper_A4_paquets,       periodCfg.oficina,  seeds.ofiPeriode, rf),
            netAny:       calcMonthly(dades.productes_neteja.mitjana_mensual.paper_higienic_rotllos,    annualCfg.neteja,   seeds.netAny,   rf),
            netPeriode:   calcMonthly(dades.productes_neteja.mitjana_mensual.paper_higienic_rotllos,    periodCfg.neteja,   seeds.netPeriode, rf),
        };
    }

    const original = computeSet(1.0);

    if (!isReductionOn) {
        return { original, reduced: null, savings: null };
    }

    const reduced = computeSet(REDUCTION_FACTOR);

    // Savings = difference between original and reduced
    const savings = Object.fromEntries(
        Object.keys(original).map(key => [key, original[key] - reduced[key]])
    );

    return { original, reduced, savings };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UI — RENDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a number for display.
 * Uses 1 decimal for kWh (precision matters), 0 for counts/litres.
 */
function fmt(value, decimals = 0) {
    return value.toLocaleString('ca-ES', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/**
 * Updates a single result row in the DOM.
 *
 * @param {string} baseId     - e.g. 'res-elec-any'
 * @param {number} original   - baseline value
 * @param {number|null} reduced - null if plan inactive
 * @param {number|null} saving
 * @param {number} decimals
 * @param {string} unit
 */
function renderRow(baseId, original, reduced, saving, decimals, unit) {
    const elOriginal = document.getElementById(`${baseId}-original`);
    const elCurrent  = document.getElementById(baseId);
    const elBadge    = document.getElementById(`badge-${baseId.replace('res-', '')}`);

    if (!elOriginal || !elCurrent || !elBadge) return;

    if (reduced !== null && saving !== null) {
        // Show original crossed-out, new value in green, saving badge
        elOriginal.textContent = fmt(original, decimals);
        elOriginal.removeAttribute('hidden');

        elCurrent.textContent = fmt(reduced, decimals);

        elBadge.textContent = `↓ Estalvi: ${fmt(saving, decimals)} ${unit}`;
        elBadge.removeAttribute('hidden');
    } else {
        // Normal mode: just show the value, hide reduction artefacts
        elOriginal.textContent = '';
        elOriginal.setAttribute('hidden', '');

        elCurrent.textContent = fmt(original, decimals);

        elBadge.textContent = '';
        elBadge.setAttribute('hidden', '');
    }
}

/**
 * Writes all 8 calculated values + optional saving badges to the DOM.
 * Also updates the saving summary panel.
 *
 * @param {{ original, reduced, savings }} results
 * @param {string} periodKey  - for unit labelling
 */
function renderResults({ original, reduced, savings }) {
    const isActive = reduced !== null;

    // Toggle class on result grid: drives CSS strikethrough + green colour
    const grid = document.querySelector('.resultats-grid');
    grid.classList.toggle('is-reduction-active', isActive);

    // Render all 8 rows
    renderRow('res-elec-any',      original.elecAny,      isActive ? reduced.elecAny      : null, isActive ? savings.elecAny      : null, 1, 'kWh');
    renderRow('res-elec-periode',  original.elecPeriode,  isActive ? reduced.elecPeriode  : null, isActive ? savings.elecPeriode  : null, 1, 'kWh');
    renderRow('res-aigua-any',     original.aiguaAny,     isActive ? reduced.aiguaAny     : null, isActive ? savings.aiguaAny     : null, 0, 'L');
    renderRow('res-aigua-periode', original.aiguaPeriode, isActive ? reduced.aiguaPeriode : null, isActive ? savings.aiguaPeriode : null, 0, 'L');
    renderRow('res-ofi-any',       original.ofiAny,       isActive ? reduced.ofiAny       : null, isActive ? savings.ofiAny       : null, 0, 'uts');
    renderRow('res-ofi-periode',   original.ofiPeriode,   isActive ? reduced.ofiPeriode   : null, isActive ? savings.ofiPeriode   : null, 0, 'uts');
    renderRow('res-net-any',       original.netAny,       isActive ? reduced.netAny       : null, isActive ? savings.netAny       : null, 0, 'uts');
    renderRow('res-net-periode',   original.netPeriode,   isActive ? reduced.netPeriode   : null, isActive ? savings.netPeriode   : null, 0, 'uts');

    // Saving summary block in control panel
    const summaryEl = document.getElementById('saving-summary');
    if (isActive && savings) {
        summaryEl.innerHTML = `
            <strong>✅ Resum d'Estalvis Anuals Projectats</strong><br>
            ⚡ Electricitat: <strong>${fmt(savings.elecAny, 1)} kWh</strong> estalviats/any<br>
            💧 Aigua: <strong>${fmt(savings.aiguaAny, 0)} L</strong> estalviats/any<br>
            📝 Paper oficina: <strong>${fmt(savings.ofiAny, 0)} paquets</strong> menys/any<br>
            🧼 Neteja: <strong>${fmt(savings.netAny, 0)} rotllos</strong> menys/any
        `;
        summaryEl.removeAttribute('hidden');
    } else {
        summaryEl.setAttribute('hidden', '');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. UI — EVENTS & STATE
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
// 6. INIT
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

        handleCalculate(); // initial render

    } catch (err) {
        showError('No s\'han pogut carregar les dades. Comprova que el fitxer JSON és accessible i correcte.');
        console.error('[ITB Init Error]', err);
    }
}

document.addEventListener('DOMContentLoaded', init);