// Variables globals
let dadesBase = null;
let modeReduccioActiu = false;

// Quan es carrega la pàgina, llegim el JSON
document.addEventListener('DOMContentLoaded', () => {
    fetch('../json/dataclean.json')
        .then(response => response.json())
        .then(data => {
            // Comprovem que l'estructura sigui la correcta
            if (!data.dades_base) {
                alert("Error: El fitxer dataclean.json no té el format correcte. Revisa'l!");
                return;
            }

            dadesBase = data.dades_base;
            console.log("Dades carregades correctament:", dadesBase);

            // MAGIC: Cridem la funció just al carregar perquè no surtin els "0" inicials
            ferCalculs();
        })
        .catch(error => console.error("Error carregant el JSON:", error));

    // Listeners pels botons i el desplegable
    document.getElementById('btn-calcular').addEventListener('click', ferCalculs);
    document.getElementById('periode-select').addEventListener('change', ferCalculs); // Es recalcula sol al canviar d'opció
    document.getElementById('btn-reduccio').addEventListener('click', toggleReduccio);
});

function toggleReduccio() {
    modeReduccioActiu = !modeReduccioActiu;
    const btn = document.getElementById('btn-reduccio');

    if(modeReduccioActiu) {
        btn.classList.add('btn-actiu');
        btn.classList.remove('btn-inactiu');
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Pla Activat (-30%)';
    } else {
        btn.classList.add('btn-inactiu');
        btn.classList.remove('btn-actiu');
        btn.innerHTML = '<i class="fa-solid fa-power-off"></i> Activar Reducció (-30%)';
    }

    if (dadesBase) ferCalculs();
}

function ferCalculs() {
    if (!dadesBase) return;

    const periodeSeleccionat = document.getElementById('periode-select').value;
    const factorReduccio = modeReduccioActiu ? 0.70 : 1.0;

    // --- ELECTRICITAT ---
    const elecMitja = dadesBase.electricitat.consum_mitja_diari_kWh;
    const elecAny = elecMitja * 365 * dadesBase.electricitat.factors_estacionals.anual_global * factorReduccio;
    let elecPeriode = elecAny;
    if (periodeSeleccionat === 'curs') elecPeriode = elecMitja * 304 * dadesBase.electricitat.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    if (periodeSeleccionat === 'hivern') elecPeriode = elecMitja * 90 * 1.3 * factorReduccio;

    // --- AIGUA ---
    const aiguaMitja = dadesBase.aigua.consum_mitja_diari_litres;
    const aiguaAny = aiguaMitja * 365 * dadesBase.aigua.factors_estacionals.anual_global * factorReduccio;
    let aiguaPeriode = aiguaAny;
    if (periodeSeleccionat === 'curs') aiguaPeriode = aiguaMitja * 304 * dadesBase.aigua.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    if (periodeSeleccionat === 'hivern') aiguaPeriode = aiguaMitja * 90 * 0.8 * factorReduccio;

    // --- OFICINA ---
    const ofiMitja = dadesBase.consumibles_oficina.mitjana_mensual.paper_A4_paquets;
    const ofiAny = ofiMitja * 12 * factorReduccio;
    let ofiPeriode = ofiAny;
    if (periodeSeleccionat === 'curs') ofiPeriode = ofiMitja * 10 * dadesBase.consumibles_oficina.factors_estacionals.curs_escolar_set_juny * factorReduccio;
    if (periodeSeleccionat === 'hivern') ofiPeriode = ofiMitja * 3 * 1.1 * factorReduccio;

    // --- NETEJA ---
    const netejaMitja = dadesBase.productes_neteja.mitjana_mensual.paper_higienic_rotllos;
    const netejaAny = netejaMitja * 12 * factorReduccio;
    let netejaPeriode = netejaAny;
    if (periodeSeleccionat === 'curs') netejaPeriode = netejaMitja * 10 * 1.1 * factorReduccio;
    if (periodeSeleccionat === 'hivern') netejaPeriode = netejaMitja * 3 * dadesBase.productes_neteja.factors_estacionals.mesos_freds_set_marc * factorReduccio;

    // --- ACTUALITZAR WEB ---
    document.getElementById('res-elec-any').textContent = elecAny.toFixed(1);
    document.getElementById('res-elec-periode').textContent = elecPeriode.toFixed(1);
    document.getElementById('res-aigua-any').textContent = aiguaAny.toFixed(0);
    document.getElementById('res-aigua-periode').textContent = aiguaPeriode.toFixed(0);
    document.getElementById('res-ofi-any').textContent = ofiAny.toFixed(0);
    document.getElementById('res-ofi-periode').textContent = ofiPeriode.toFixed(0);
    document.getElementById('res-net-any').textContent = netejaAny.toFixed(0);
    document.getElementById('res-net-periode').textContent = netejaPeriode.toFixed(0);
}