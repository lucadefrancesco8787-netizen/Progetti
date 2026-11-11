/* Zeta Club — app del cliente: appuntamenti, scheda con pesi, ultima visita */
import { avviaRecupero, configura as configuraTimer, ripristina as ripristinaTimer, durata } from '/app/timer.js';

// Il timer di recupero sta sopra la barra delle sezioni
configuraTimer({ bottom: 'calc(var(--tabs-h) + env(safe-area-inset-bottom, 0px) + 10px)' });

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const view = $('#view');
const state = { dati: null, giorno: null, utente: null };
const NAV_CLIENTE = document.querySelector('.tabs').innerHTML; // lo staff la sostituisce con le sue sezioni
let staffMod = null;

/* ---------- Date in italiano ---------- */
const dataUTC = (s) => new Date(`${s}T12:00:00Z`);
const fmt = (s, opz) => new Intl.DateTimeFormat('it-IT', { timeZone: 'UTC', ...opz }).format(dataUTC(s));
const giorniTra = (a, b) => Math.round((dataUTC(b) - dataUTC(a)) / 86400000);
function quando(s) {
  const d = giorniTra(state.dati.oggi, s);
  if (d === 0) return 'Oggi';
  if (d === 1) return 'Domani';
  if (d === -1) return 'Ieri';
  if (d > 1 && d < 7) return fmt(s, { weekday: 'long' });
  return fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });
}
function fa(s) {
  const d = giorniTra(s, state.dati.oggi);
  if (d === 0) return 'oggi';
  if (d === 1) return 'ieri';
  if (d < 14) return `${d} giorni fa`;
  return `il ${fmt(s, { day: 'numeric', month: 'short' })}`;
}
const kg = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));
const num = (n, dec = 1) => (n == null ? '—' : n.toLocaleString('it-IT', { maximumFractionDigits: dec }));

/* ---------- Rete ---------- */
async function api(url, opz = {}) {
  const res = await fetch(url, {
    ...opz,
    headers: { Accept: 'application/json', ...(opz.body ? { 'Content-Type': 'application/json' } : {}) },
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { mostraLogin(); throw new Error('login'); }
  if (!res.ok || json.ok === false) throw new Error(json.errore || 'Qualcosa è andato storto. Riprova.');
  return json;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Avvio e login ---------- */
function nascondiSplash() {
  const s = $('#splash');
  if (!s) return; // già rimossa (es. login dopo la schermata di accesso)
  s.classList.add('out');
  setTimeout(() => s.remove(), 400);
}

function mostraLogin() {
  $('#shell').hidden = true;
  $('#login').hidden = false;
  nascondiSplash();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const err = $('#loginError');
  const btn = f.querySelector('button');
  err.textContent = '';
  btn.disabled = true;
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: f.email.value, password: f.password.value }) });
    f.reset();
    await carica();
  } catch (ex) {
    if (ex.message !== 'login') err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

async function carica() {
  try {
    // Chi è collegato? Il cliente vede la sua app, lo staff la propria (public/app/staff.js)
    const { utente } = await api('/api/auth/me');
    state.utente = utente;
    if (utente.ruolo !== 'cliente') {
      state.dati = null;
      $('#login').hidden = true;
      $('#shell').hidden = false;
      $('#avatarBtn').textContent = (utente.nome[0] + utente.cognome[0]).toUpperCase();
      staffMod ??= await import('/app/staff.js');
      await staffMod.avvia(ctx);
      nascondiSplash();
      return;
    }
    document.body.classList.remove('is-staff');
    const nav = document.querySelector('.tabs');
    if (nav.dataset.staff) { nav.innerHTML = NAV_CLIENTE; nav.style.gridTemplateColumns = ''; delete nav.dataset.staff; }
    const dati = await api('/api/app');
    state.dati = dati;
    $('#login').hidden = true;
    $('#shell').hidden = false;
    const u = dati.utente;
    $('#avatarBtn').textContent = (u.nome[0] + u.cognome[0]).toUpperCase();
    nascondiSplash();
    render();
    ripristinaTimer();
  } catch (ex) {
    if (ex.message === 'login') return;
    // 403 = account non cliente (staff): lo diciamo chiaramente
    nascondiSplash();
    $('#login').hidden = false;
    $('#shell').hidden = true;
    $('#loginError').textContent = ex.message;
  }
}

/* ---------- Navigazione ---------- */
const SCHERMATE = {
  oggi: { titolo: 'Oggi', render: renderOggi },
  appuntamenti: { titolo: 'Agenda', render: renderAppuntamenti },
  scheda: { titolo: 'Scheda', render: renderScheda },
  visita: { titolo: 'Visita', render: renderVisita },
};
const tabCorrente = () => (SCHERMATE[location.hash.slice(1)] ? location.hash.slice(1) : 'oggi');

function render() {
  if (!state.dati) return;
  const tab = tabCorrente();
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#topTitle').textContent = SCHERMATE[tab].titolo;
  $('#topKicker').textContent = tab === 'oggi' ? fmt(state.dati.oggi, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Zeta Club';
  view.innerHTML = SCHERMATE[tab].render(state.dati);
  SCHERMATE[tab].dopo?.();
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
window.addEventListener('scroll', () => $('.top')?.classList.toggle('scrolled', scrollY > 4), { passive: true });

/* ---------- Appuntamenti ---------- */
function cardAppuntamento(a, hero = false) {
  const meta = [a.inizio && `${a.inizio}${a.fine ? `–${a.fine}` : ''}`, a.con, a.luogo].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="card ${hero ? 'card--hero' : ''}">
      <div class="appt">
        <div class="appt__date"><b>${esc(fmt(a.data, { day: 'numeric' }))}</b><small>${esc(fmt(a.data, { month: 'short' }))}</small></div>
        <div>
          ${hero ? `<div class="kicker">${esc(quando(a.data))}</div>` : ''}
          <h3>${esc(a.titolo)}</h3>
          <p class="appt__meta">${meta}</p>
          ${a.dettaglio ? `<p class="appt__note">${esc(a.dettaglio)}</p>` : ''}
          ${a.codice ? `<p class="appt__meta">Codice prenotazione <b>${esc(a.codice)}</b></p>` : ''}
        </div>
      </div>
    </article>`;
}

function renderAppuntamenti({ appuntamenti }) {
  if (!appuntamenti.length) return `<div class="card empty"><strong>Nessun appuntamento in programma</strong>Quando prenoti una visita o una seduta la trovi qui.</div>`;
  let html = '', ultimo = null;
  for (const a of appuntamenti) {
    if (a.data !== ultimo) { html += `<h2 class="day-label">${esc(quando(a.data))}</h2>`; ultimo = a.data; }
    html += cardAppuntamento(a);
  }
  return html;
}

/* ---------- Scheda ---------- */
// Il giorno consigliato è quello fatto meno di recente
function giornoConsigliato(scheda) {
  return [...scheda.giorni].sort((a, b) => (a.ultimaSeduta || '').localeCompare(b.ultimaSeduta || ''))[0];
}

function renderScheda({ scheda }) {
  if (!scheda) return `<div class="card empty"><strong>Nessuna scheda attiva</strong>Chiedi al tuo trainer di prepararla: la troverai qui.</div>`;
  if (!scheda.giorni.some((g) => g.id === state.giorno)) state.giorno = giornoConsigliato(scheda).id;
  const g = scheda.giorni.find((x) => x.id === state.giorno);
  const fatti = g.esercizi.filter((e) => e.oggi != null).length;
  const conPeso = g.esercizi.filter((e) => e.conPeso).length;
  SCHERMATE.scheda.dopo = collegaScheda;

  return `
    <section class="card plan-head">
      <div class="kicker">${esc(scheda.obiettivo || 'La tua scheda')}</div>
      <h2>${esc(scheda.titolo)}</h2>
      <p>${scheda.trainer ? `Preparata da ${esc(scheda.trainer)} · ` : ''}dal ${esc(fmt(scheda.inizio, { day: 'numeric', month: 'short' }))}${scheda.fine ? ` al ${esc(fmt(scheda.fine, { day: 'numeric', month: 'short' }))}` : ''}</p>
    </section>

    <div class="segmented" role="group" aria-label="Giorno di allenamento">
      ${scheda.giorni.map((x) => `<button type="button" data-giorno="${x.id}" aria-pressed="${x.id === g.id}">${esc(x.nome.split('·')[0].trim())}</button>`).join('')}
    </div>

    <div class="day-info">
      <b>${esc(g.nome.split('·').slice(1).join('·').trim() || g.nome)}</b>
      <span id="progress">${conPeso ? `${fatti}/${conPeso} segnati oggi` : ''}</span>
    </div>
    <p class="day-info" style="margin-top:-6px">${g.ultimaSeduta ? `Ultima volta ${esc(fa(g.ultimaSeduta))}` : 'Non ancora fatto'}</p>

    ${g.esercizi.map((e, i) => cardEsercizio(e, i)).join('')}

    ${scheda.note ? `<div class="card plan-notes"><div class="kicker">Note del trainer</div><p style="margin:8px 0 0">${esc(scheda.note)}</p></div>` : ''}`;
}

function cardEsercizio(e, i) {
  const rx = [`<span><b>${e.serie}</b> serie</span>`, `<span><b>${esc(e.ripetizioni)}</b>${/^[\d\s–-]+$/.test(e.ripetizioni) ? ' rip.' : ''}</span>`];
  // Il recupero è mostrato sul pulsante del timer (m:ss), non qui
  // Un peso per ogni serie: cambiando una serie cambiano anche quelle dopo (vedi collegaScheda)
  const righeSerie = e.conPeso ? (e.oggiSerie || [e.oggi]).map((p, s) => {
    const prima = e.ultimoSerie?.[s] ?? e.ultimo?.peso_kg;
    return `
        <div class="set-row">
          <span class="set-row__n">Serie ${s + 1}</span>
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="Diminuisci peso della serie ${s + 1}">−</button>
            <label><input type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" data-peso="${s}"
              value="${p != null ? kg(p) : ''}" placeholder="${prima != null ? kg(prima) : '0'}"
              aria-label="Peso di oggi per ${esc(e.nome)}, serie ${s + 1}, in chilogrammi"><span class="unit">kg</span></label>
            <button type="button" data-step="1" aria-label="Aumenta peso della serie ${s + 1}">+</button>
          </div>
        </div>`;
  }).join('') : '';
  const log = e.conPeso ? `
      <div class="ex__log">
        <div class="ex__last">${e.ultimo ? `Ultima volta<br><b>${kg(e.ultimo.peso_kg)} kg</b> · ${esc(fa(e.ultimo.data))}` : 'Prima volta:<br>segna il peso usato'}</div>
      </div>
      <div class="set-list">${righeSerie}</div>
      <div class="ex__foot">
        <span class="save-state ${e.oggi != null ? 'ok' : ''}" data-stato>${e.oggi != null ? '✓ Segnato oggi' : ''}</span>
        ${e.ultimo || e.oggi != null ? `<button type="button" class="link-btn" data-storico>Andamento</button>` : ''}
      </div>` : '';
  return `
    <article class="card ex ${e.oggi != null ? 'done' : ''}" data-es="${e.id}">
      <div class="ex__top">
        <span class="ex__n">${e.oggi != null ? '✓' : i + 1}</span>
        <div><h3>${esc(e.nome)}</h3><div class="ex__rx">${rx.join('')}</div></div>
      </div>
      ${e.note ? `<p class="ex__note">${esc(e.note)}</p>` : ''}
      ${e.recupero ? `<button type="button" class="rest-btn" data-timer aria-label="Avvia il recupero di ${durata(e.recupero)} per ${esc(e.nome)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>
        <span>Recupero <b>${durata(e.recupero)}</b></span></button>` : ''}
      ${log}
    </article>`;
}

function trovaEsercizio(id) {
  for (const g of state.dati.scheda.giorni) { const e = g.esercizi.find((x) => x.id === id); if (e) return e; }
  return null;
}

function aggiornaProgresso() {
  const g = state.dati.scheda.giorni.find((x) => x.id === state.giorno);
  const conPeso = g.esercizi.filter((e) => e.conPeso).length;
  const p = $('#progress');
  if (p) p.textContent = `${g.esercizi.filter((e) => e.oggi != null).length}/${conPeso} segnati oggi`;
}

const timers = new Map();
// Salvataggi dei pesi in corso, per esercizio. Sta fuori da collegaScheda perché la scheda
// può essere ridisegnata mentre un salvataggio è ancora in viaggio.
const salvataggi = { inViaggio: new Set(), daRifare: new Map() };
function collegaScheda() {
  view.querySelectorAll('[data-giorno]').forEach((b) => b.addEventListener('click', () => {
    state.giorno = Number(b.dataset.giorno);
    render();
  }));

  view.querySelectorAll('.ex[data-es]').forEach((card) => {
    const id = Number(card.dataset.es);
    const ex = trovaEsercizio(id);
    card.querySelector('[data-timer]')?.addEventListener('click', () => avviaRecupero({ secondi: ex.recupero, titolo: ex.nome }));
    const inputs = [...card.querySelectorAll('[data-peso]')];
    if (!inputs.length) return;
    const stato = card.querySelector('[data-stato]');
    const e = trovaEsercizio(id);

    // Solo numeri scritti normalmente ("40", "42,5", "42.5"); "0x10", "1e2" ecc. → NaN (peso non valido)
    const leggi = (inp) => { const v = inp.value.trim(); return v === '' ? null : /^\d+([.,]\d+)?$/.test(v) ? Number(v.replace(',', '.')) : NaN; };
    // Cambiare il peso di una serie lo copia su tutte le serie dopo (restano modificabili una per una).
    // Le serie dopo si calcolano dai valori che avevano quando si è iniziato a modificare:
    // così cancellando "40" un tasto alla volta non resta il "4" di passaggio, e svuotare
    // una serie rimette le altre com'erano.
    let prima = null; // { i, valori } delle serie dopo, all'inizio della modifica in corso
    const propaga = (i) => {
      if (!prima || prima.i !== i) prima = { i, valori: inputs.slice(i + 1).map((x) => x.value) };
      const v = inputs[i].value.trim();
      inputs.slice(i + 1).forEach((inp, k) => { inp.value = v !== '' ? v : prima.valori[k]; });
    };
    const fineModifica = () => { prima = null; };

    const esito = () => {
      stato.className = `save-state ${e.oggi != null ? 'ok' : ''}`;
      stato.textContent = e.oggi != null ? '✓ Salvato' : 'Peso cancellato';
    };

    // Un solo salvataggio alla volta per esercizio: se ne serve un altro mentre uno è in viaggio,
    // si rifà alla fine con i valori di quel momento (così l'ultimo valore scritto vince sempre).
    async function salva() {
      if (salvataggi.inViaggio.has(id)) { salvataggi.daRifare.set(id, salva); return; }
      const pesi = inputs.map(leggi);
      if (pesi.some((v) => v != null && (!Number.isFinite(v) || v < 0 || v > 1000))) { stato.className = 'save-state err'; stato.textContent = 'Peso non valido'; return; }
      if (JSON.stringify(pesi) === JSON.stringify(e.oggiSerie)) {
        if (stato.textContent === 'Salvataggio…') esito(); // giro rifatto senza modifiche nuove
        return;
      }
      stato.className = 'save-state'; stato.textContent = 'Salvataggio…';
      salvataggi.inViaggio.add(id);
      try {
        const r = await api(`/api/app/esercizi/${id}/serie`, { method: 'PUT', body: JSON.stringify({ pesi }) });
        e.oggiSerie = r.pesi;
        e.oggi = r.peso_kg;
        card.classList.toggle('done', e.oggi != null);
        card.querySelector('.ex__n').textContent = e.oggi != null ? '✓' : [...card.parentNode.querySelectorAll('.ex')].indexOf(card) + 1;
        if (!salvataggi.daRifare.has(id)) esito(); // "Salvato" solo se non c'è un altro salvataggio in coda
        if (e.oggi != null && !card.querySelector('[data-storico]')) {
          card.querySelector('.ex__foot').insertAdjacentHTML('beforeend', '<button type="button" class="link-btn" data-storico>Andamento</button>');
          card.querySelector('[data-storico]').addEventListener('click', () => apriStorico(e));
        }
        aggiornaProgresso();
      } catch (ex) {
        if (ex.message === 'login') salvataggi.daRifare.delete(id); // sessione scaduta: niente secondo tentativo
        else {
          stato.className = 'save-state err';
          stato.textContent = navigator.onLine ? ex.message : 'Sei offline: riprova quando torna la rete';
        }
      } finally {
        salvataggi.inViaggio.delete(id);
        const rifai = salvataggi.daRifare.get(id);
        salvataggi.daRifare.delete(id);
        rifai?.();
      }
    }
    const salvaPresto = (ms) => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(salva, ms)); };

    inputs.forEach((input, i) => {
      input.addEventListener('input', () => { propaga(i); stato.className = 'save-state'; stato.textContent = ''; salvaPresto(1200); });
      input.addEventListener('change', () => { fineModifica(); salvaPresto(0); });
      input.addEventListener('blur', fineModifica);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });

      // +/−: passo 2,5 kg (1 kg sotto i 10 kg); se vuoto parte dal peso suggerito (ultima volta)
      input.closest('.stepper').querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const dir = Number(b.dataset.step);
        const suggerito = e.ultimoSerie?.[i] ?? e.ultimo?.peso_kg ?? null;
        const letto = Number.isFinite(leggi(input)) ? leggi(input) : null; // scritta non valida: si riparte dal suggerito
        const base = letto ?? suggerito ?? 0;
        const passo = base < 10 || (base === 10 && dir < 0) ? 1 : 2.5;
        const nuovo = letto == null && suggerito != null ? base : Math.max(0, Math.round((base + dir * passo) * 100) / 100);
        input.value = kg(nuovo);
        fineModifica(); // ogni tocco su +/− è una modifica completa
        propaga(i);
        fineModifica();
        stato.className = 'save-state'; stato.textContent = '';
        salvaPresto(900);
      }));
    });

    card.querySelector('[data-storico]')?.addEventListener('click', () => apriStorico(e));
  });
}

/* ---------- Andamento di un esercizio (grafico) ---------- */
async function apriStorico(e) {
  apriFoglio(e.nome, '<p class="muted">Carico lo storico…</p>');
  try {
    const { storico } = await api(`/api/app/esercizi/${e.id}/storico`);
    $('#sheetBody').innerHTML = storico.length ? htmlStorico(storico) : '<p class="muted">Nessun peso segnato finora.</p>';
    if (storico.length) collegaGrafico(storico);
  } catch (ex) {
    if (ex.message !== 'login') $('#sheetBody').innerHTML = `<p class="muted">${esc(ex.message)}</p>`;
  }
}

function htmlStorico(s) {
  const primo = s[0].kg, ultimo = s[s.length - 1].kg, max = Math.max(...s.map((x) => x.kg));
  const diff = ultimo - primo;
  return `
    <p class="muted" style="margin:6px 0 0">Peso usato, in kg · ultime ${s.length} sedute</p>
    <div class="chart" id="chart">${svgGrafico(s)}<div class="chart__tip" id="chartTip" hidden></div></div>
    <div class="chart__summary">
      <div><small>Ultimo</small><b>${kg(ultimo)} kg</b></div>
      <div><small>Massimo</small><b>${kg(max)} kg</b></div>
      <div><small>Dall'inizio</small><b>${diff > 0 ? '+' : ''}${kg(diff)} kg</b></div>
    </div>
    <table class="history">
      <thead><tr><th scope="col">Data</th><th scope="col">Peso</th></tr></thead>
      <tbody>${[...s].reverse().map((x) => `<tr><td>${esc(fmt(x.data, { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td>${kg(x.kg)} kg</td></tr>`).join('')}</tbody>
    </table>`;
}

// Una sola serie: linea 2px, punti ≥ 8px, griglia leggera, etichetta solo sull'ultimo valore
function svgGrafico(s) {
  const W = 340, H = 180, L = 34, R = 36, T = 16, B = 26;
  const vals = s.map((x) => x.kg);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 5; hi += 5; }
  const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi += pad;
  const passo = [1, 2, 2.5, 5, 10, 20, 25, 50].find((p) => (hi - lo) / p <= 4) || 100;
  const y0 = Math.floor(lo / passo) * passo, y1 = Math.ceil(hi / passo) * passo;
  const x = (i) => L + (s.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (s.length - 1));
  const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = []; for (let v = y0; v <= y1 + 1e-9; v += passo) ticks.push(v);
  const pts = s.map((p, i) => [x(i), y(p.kg)]);
  const linea = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const area = `${linea}L${pts.at(-1)[0].toFixed(1)},${H - B}L${pts[0][0].toFixed(1)},${H - B}Z`;
  const etichette = s.length <= 6 ? s.map((_, i) => i) : [0, Math.floor((s.length - 1) / 2), s.length - 1];
  const last = pts.at(-1);
  return `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento del peso: da ${kg(s[0].kg)} a ${kg(s.at(-1).kg)} kg">
      <defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fc26b" stop-opacity=".22"/><stop offset="1" stop-color="#3fc26b" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${ticks.map((v) => `<line x1="${L}" x2="${W - R + 10}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axis">
        ${ticks.map((v) => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${kg(v)}</text>`).join('')}
        ${etichette.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(fmt(s[i].data, { day: 'numeric', month: 'short' }))}</text>`).join('')}
      </g>
      <path class="area" d="${area}"/>
      <path class="series" d="${linea}"/>
      ${pts.map(([a, b], i) => `<circle class="dot" cx="${a}" cy="${b}" r="4.5" data-i="${i}"/>`).join('')}
      <text class="label" x="${last[0] + 8}" y="${last[1] + 4}">${kg(s.at(-1).kg)}</text>
      ${pts.map(([a], i) => `<rect class="hit" x="${a - 18}" y="0" width="36" height="${H}" data-i="${i}"/>`).join('')}
    </svg>`;
}

function collegaGrafico(s) {
  const chart = $('#chart'), tip = $('#chartTip');
  const dots = chart.querySelectorAll('.dot');
  const mostra = (i) => {
    const d = dots[i], svg = chart.querySelector('svg');
    const scala = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    dots.forEach((x) => x.classList.toggle('active', x === d));
    tip.hidden = false;
    tip.textContent = `${kg(s[i].kg)} kg · ${fmt(s[i].data, { day: 'numeric', month: 'short' })}`;
    tip.style.left = `${d.cx.baseVal.value * scala}px`;
    tip.style.top = `${d.cy.baseVal.value * scala - 8}px`;
  };
  chart.querySelectorAll('.hit').forEach((h) => {
    h.addEventListener('pointerenter', () => mostra(Number(h.dataset.i)));
    h.addEventListener('pointerdown', () => mostra(Number(h.dataset.i)));
  });
  chart.addEventListener('pointerleave', () => { tip.hidden = true; dots.forEach((x) => x.classList.remove('active')); });
}

/* ---------- Visita ---------- */
// meglio: 1 = aumentare è positivo, -1 = diminuire è positivo, 0 = neutro
const METRICHE = [
  ['peso', 'Peso', 'kg', 1, 0],
  ['grasso', 'Massa grassa', '%', 1, -1],
  ['muscolo', 'Massa muscolare', 'kg', 1, 1],
  ['acqua', 'Acqua corporea', '%', 1, 1],
  ['viscerale', 'Grasso viscerale', 'livello', 0, -1],
  ['bmi', 'BMI', '', 1, 0],
  ['metabolismo', 'Metabolismo basale', 'kcal', 0, 1],
  ['etaMetabolica', 'Età metabolica', 'anni', 0, -1],
  ['vita', 'Circonferenza vita', 'cm', 1, -1],
  ['fianchi', 'Circonferenza fianchi', 'cm', 1, -1],
];
const FRECCIA = { su: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4"/></svg>', giu: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4"/></svg>' };

function delta(chiave, v, prima, dec, meglio) {
  if (v == null || prima == null) return '';
  const d = Math.round((v - prima) * 10 ** dec) / 10 ** dec;
  if (d === 0) return '<div class="metric__delta">= invariato</div>';
  const classe = meglio === 0 ? '' : (d > 0) === (meglio > 0) ? 'good' : 'bad';
  const giudizio = classe === 'good' ? ', migliorato' : classe === 'bad' ? ', da tenere d\'occhio' : '';
  return `<div class="metric__delta ${classe}" aria-label="${d > 0 ? 'aumentato' : 'diminuito'} di ${num(Math.abs(d), dec)}${giudizio}">${d > 0 ? FRECCIA.su : FRECCIA.giu}${d > 0 ? '+' : '−'}${num(Math.abs(d), dec)}</div>`;
}

function renderVisita({ visite }) {
  const v = visite.ultima, p = visite.precedente;
  if (!v) return `<div class="card empty"><strong>Nessuna visita ancora</strong>Dopo la tua analisi Visbody trovi qui tutti i risultati.</div>`;
  const tiles = METRICHE.filter(([k]) => v.valori[k] != null).map(([k, label, unita, dec, meglio]) => `
    <div class="metric">
      <span class="metric__label">${label}</span>
      <span class="metric__value">${num(v.valori[k], dec)}${unita ? `<small>${unita}</small>` : ''}</span>
      ${p ? delta(k, v.valori[k], p.valori[k], dec, meglio) : ''}
    </div>`).join('');
  return `
    <section class="card card--hero">
      <div class="visit-head">
        <div>
          <div class="kicker">Ultima visita · ${esc(fa(v.data))}</div>
          <h2>Analisi Visbody</h2>
          <p class="muted" style="margin:0">${esc(fmt(v.data, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}${v.trainer ? ` · con ${esc(v.trainer)}` : ''}</p>
        </div>
      </div>
    </section>
    ${p ? `<p class="section-title">Confronto con il ${esc(fmt(p.data, { day: 'numeric', month: 'long' }))}</p>` : '<p class="section-title">I tuoi valori</p>'}
    <div class="metrics">${tiles}</div>
    ${v.note ? `<div class="card trainer-note" style="margin-top:10px"><div class="kicker">Commento del trainer</div><p>${esc(v.note)}</p></div>` : ''}`;
}

/* ---------- Oggi ---------- */
function renderOggi(d) {
  const prossimo = d.appuntamenti[0];
  const s = d.scheda;
  const g = s && giornoConsigliato(s);
  const v = d.visite.ultima;
  return `
    <p class="hello">Ciao ${esc(d.utente.nome)}, pronto ad allenarti?</p>

    <h2 class="section-title">Prossimo appuntamento</h2>
    ${prossimo ? cardAppuntamento(prossimo, true) : '<div class="card empty"><strong>Niente in agenda</strong>Prenota una visita Visbody dal sito.</div>'}
    ${d.appuntamenti.length > 1 ? `<a class="card today-plan" href="#appuntamenti" style="margin-top:10px"><p>Altri ${d.appuntamenti.length - 1} appuntamenti in agenda</p><svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a>` : ''}

    <h2 class="section-title">Allenamento consigliato</h2>
    ${g ? `
      <a class="card today-plan" href="#scheda" data-vai-giorno="${g.id}">
        <div>
          <div class="kicker">${esc(g.nome.split('·')[0].trim())}</div>
          <h3>${esc(g.nome.split('·').slice(1).join('·').trim() || g.nome)}</h3>
          <p>${g.esercizi.length} esercizi · ${g.ultimaSeduta ? `ultima volta ${esc(fa(g.ultimaSeduta))}` : 'non ancora fatto'}</p>
        </div>
        <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
      </a>` : '<div class="card empty"><strong>Nessuna scheda attiva</strong>Chiedi al tuo trainer.</div>'}

    ${v ? `
      <h2 class="section-title">Ultima visita</h2>
      <a class="card today-plan" href="#visita" style="display:block">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><div class="kicker">Visbody · ${esc(fa(v.data))}</div></div>
          <svg class="chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </div>
        <div class="mini-metrics">
          <div><small>Peso</small><b>${num(v.valori.peso)}</b> <small style="display:inline">kg</small></div>
          <div><small>Grasso</small><b>${num(v.valori.grasso)}</b> <small style="display:inline">%</small></div>
          <div><small>Muscolo</small><b>${num(v.valori.muscolo)}</b> <small style="display:inline">kg</small></div>
        </div>
      </a>` : ''}`;
}
SCHERMATE.oggi.dopo = () => {
  view.querySelector('[data-vai-giorno]')?.addEventListener('click', (e) => { state.giorno = Number(e.currentTarget.dataset.vaiGiorno); });
};

/* ---------- Foglio dal basso + profilo ---------- */
function apriFoglio(titolo, html) {
  const sh = $('#sheet');
  $('#sheetTitle').textContent = titolo;
  $('#sheetBody').innerHTML = html;
  sh.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add('open')));
  document.body.style.overflow = 'hidden';
}
function chiudiFoglio() {
  const sh = $('#sheet');
  sh.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { sh.hidden = true; }, 320);
}
$('#sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) chiudiFoglio(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) chiudiFoglio(); });

const installata = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

$('#avatarBtn').addEventListener('click', () => {
  const u = state.utente;
  apriFoglio(`${u.nome} ${u.cognome}`, `
    <div class="profile">
      ${installata() ? '' : `
        <div class="card" style="background:var(--surface-2)">
          <div class="kicker">Installa l'app su iPhone</div>
          <ol>
            <li>Apri questa pagina in <b>Safari</b></li>
            <li>Tocca il pulsante <b>Condividi</b> (il quadrato con la freccia)</li>
            <li>Scegli <b>Aggiungi alla schermata Home</b></li>
          </ol>
        </div>`}
      <a class="btn btn--ghost" href="/">Vai al sito Zeta Club</a>
      <button class="btn btn--ghost" type="button" id="logoutBtn">Esci</button>
    </div>`);
  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    state.dati = null;
    state.utente = null;
    chiudiFoglio();
    mostraLogin();
  });
});

/* ---------- Ritorno all'app: dati freschi ---------- */
document.addEventListener('visibilitychange', () => {
  // Non ricaricare mentre si sta scrivendo un peso
  if (document.visibilityState === 'visible' && state.utente && !document.activeElement?.matches('input, textarea, select') && $('#sheet').hidden) carica();
});
window.addEventListener('online', () => toast('Sei di nuovo online'));
window.addEventListener('offline', () => toast('Sei offline'));

/* ---------- Strumenti condivisi con l'app dello staff ---------- */
const ctx = {
  $, esc, api, toast, fmt, kg, num, apriFoglio, chiudiFoglio, view,
  get utente() { return state.utente; },
  attivo: () => !!state.utente && state.utente.ruolo !== 'cliente',
  impostaTitolo(titolo, kicker) { $('#topTitle').textContent = titolo; $('#topKicker').textContent = kicker; },
};

/* ---------- Service worker (funziona anche con rete scarsa) ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch(() => {});

carica();
