// Variables globals
let dadesBase = null;
let modeReduccioActiu = false;

// Quan es carrega la pàgina, llegim el JSON
document.addEventListener('DOMContentLoaded', () => {
    fetch('json/dataclean.json')
        .then(response => response.json())
        .then(data => {
            dadesBase = data.dades_base;
            console.log("Dades carregades correctament:", dadesBase);
        })
        .catch(error => console.error("Error carregant el JSON:", error));

    // Listeners pels botons
    document.getElementById('btn-calcular').addEventListener('click', ferCalculs);
    document.getElementById('btn-reduccio').addEventListener('click', toggleReduccio);
});

function toggleReduccio() {
    modeReduccioActiu = !modeReduccioActiu;
    const btn = document.getElementById('btn-reduccio');

    if(modeReduccioActiu) {
        btn.classList.add('btn-actiu');
        btn.classList.remove('btn-inactiu');
        btn.textContent = "Pla de Reducció Activat (-30%)";
    } else {
        btn.classList.add('btn-inactiu');
        btn.classList.remove('btn-actiu');
        btn.textContent = "Activar Pla de Reducció";
    }

    // Recalcular automàticament si ja teníem dades
    if (dadesBase) ferCalculs();
}

function ferCalculs() {
    if (!dadesBase) {
        alert("Encara s'estan carregant les dades. Torna-ho a provar en un segon.");
        return;
    }

    const periodeSeleccionat = document.getElementById('periode-select').value;

    // Factor de reducció (30% menys si està actiu)
    const factorReduccio = modeReduccioActiu ? 0.70 : 1.0;

    // --- 1 & 2: CÀLCULS D'ELECTRICITAT ---
    const elecMitja = dadesBase.electricitat.consum_mitja_diari_kWh;
    const elecAny = elecMitja * 365 * dadesBase.electricitat.factors_estacionals.anual_global * factorReduccio;

    let elecPeriode = 0;
    if (periodeSeleccionat === 'curs') {
        // 304 dies aprox de setembre a juny amb factor d'estacionalitat més alt
        elecPeriode = elecMitja * 304 * dadesBase.electricitat.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    } else if (periodeSeleccionat === 'hivern') {
        // 90 dies d'hivern (més consum de calefacció)
        elecPeriode = elecMitja * 90 * 1.3 * factorReduccio;
    } else {
        elecPeriode = elecAny; // Si és anual, és el mateix
    }

    // --- 3 & 4: CÀLCULS D'AIGUA ---
    const aiguaMitja = dadesBase.aigua.consum_mitja_diari_litres;
    const aiguaAny = aiguaMitja * 365 * dadesBase.aigua.factors_estacionals.anual_global * factorReduccio;

    let aiguaPeriode = 0;
    if (periodeSeleccionat === 'curs') {
        aiguaPeriode = aiguaMitja * 304 * dadesBase.aigua.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    } else if (periodeSeleccionat === 'hivern') {
        aiguaPeriode = aiguaMitja * 90 * 0.8 * factorReduccio; // A l'hivern es gasta menys aigua que a la primavera/estiu
    } else {
        aiguaPeriode = aiguaAny;
    }

    // --- 5 & 6: CÀLCULS OFICINA ---
    const ofiMitjaMensual = dadesBase.consumibles_oficina.mitjana_mensual.paper_A4_paquets;
    const ofiAny = ofiMitjaMensual * 12 * factorReduccio;

    let ofiPeriode = 0;
    if (periodeSeleccionat === 'curs') {
        ofiPeriode = ofiMitjaMensual * 10 * dadesBase.consumibles_oficina.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    } else if (periodeSeleccionat === 'hivern') {
        ofiPeriode = ofiMitjaMensual * 3 * 1.1 * factorReduccio;
    } else {
        ofiPeriode = ofiAny;
    }

    // --- 7 & 8: CÀLCULS NETEJA ---
    const netejaMitjaMensual = dadesBase.productes_neteja.mitjana_mensual.paper_higienic_rotllos;
    const netejaAny = netejaMitjaMensual * 12 * factorReduccio;

    let netejaPeriode = 0;
    if (periodeSeleccionat === 'curs') {
        netejaPeriode = netejaMitjaMensual * 10 * 1.1 * factorReduccio;
    } else if (periodeSeleccionat === 'hivern') {
        // Factor d'hivern (1.3) aplicat per temporada de virus/refredats
        netejaPeriode = netejaMitjaMensual * 3 * dadesBase.productes_neteja.factors_estacionals.mesos_freds_set_marc * factorReduccio;
    } else {
        netejaPeriode = netejaAny;
    }

    // --- ACTUALITZAR EL DOM (Pintar resultats a la web) ---
    document.getElementById('res-elec-any').textContent = elecAny.toFixed(2);
    document.getElementById('res-elec-periode').textContent = elecPeriode.toFixed(2);

    document.getElementById('res-aigua-any').textContent = aiguaAny.toFixed(2);
    document.getElementById('res-aigua-periode').textContent = aiguaPeriode.toFixed(2);

    document.getElementById('res-ofi-any').textContent = ofiAny.toFixed(0);
    document.getElementById('res-ofi-periode').textContent = ofiPeriode.toFixed(0);

    document.getElementById('res-net-any').textContent = netejaAny.toFixed(0);
    document.getElementById('res-net-periode').textContent = netejaPeriode.toFixed(0);
}
