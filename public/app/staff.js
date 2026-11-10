/*
 * Zeta Club — app dello staff.
 * Sezioni per ruolo: agenda + impegni (tutti), turni e cambi turno (reception, trainer),
 * attività (reception), chiamate (consulenti), schede dei clienti (trainer).
 */
let c;                 // contesto condiviso da app.js (api, esc, fmt, foglio, toast…)
let dati = null;       // riepilogo da /api/staff
let avviata = false;
const editor = { clienteId: null, cliente: null, scheda: null, sporco: false, esistente: false };

const SEZIONI = {
  agenda: { titolo: 'Agenda', icona: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
  turni: { titolo: 'Turni', icona: '<path d="M4 7h11l-3-3M20 17H9l3 3"/>' },
  attivita: { titolo: 'Attività', icona: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>' },
  chiamate: { titolo: 'Chiamate', icona: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>' },
  schede: { titolo: 'Schede', icona: '<path d="M2.5 12h2M19.5 12h2M6.5 12h11"/><rect x="4.5" y="8" width="3" height="8" rx="1"/><rect x="16.5" y="8" width="3" height="8" rx="1"/>' },
};
const PER_RUOLO = {
  trainer: ['agenda', 'schede', 'turni'],
  receptionist: ['attivita', 'turni', 'agenda'],
  consulente: ['chiamate', 'agenda'],
  istruttore: ['agenda'],
};
const ETICHETTE = { receptionist: 'Reception', consulente: 'Consulente', trainer: 'Personal Trainer', istruttore: 'Istruttore corsi' };

/* ---------- Avvio ---------- */
export async function avvia(ctx) {
  c = ctx;
  document.body.classList.add('is-staff');
  costruisciNav();
  if (!avviata) {
    avviata = true;
    window.addEventListener('hashchange', () => { if (c.attivo()) { render(); window.scrollTo(0, 0); } });
    window.addEventListener('beforeunload', (e) => { if (editor.sporco) e.preventDefault(); });
  }
  await ricarica();
}

async function ricarica() {
  dati = await c.api('/api/staff');
  render();
}

function sezioni() { return PER_RUOLO[c.utente.ruolo] || ['agenda']; }

function costruisciNav() {
  const nav = c.$('.tabs');
  const lista = sezioni();
  nav.dataset.staff = '1';
  nav.style.gridTemplateColumns = `repeat(${lista.length}, 1fr)`;
  nav.innerHTML = lista.map((k) => `
    <a href="#${k}" data-tab="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${SEZIONI[k].icona}</svg><span>${SEZIONI[k].titolo}</span>${k === 'turni' ? '<i class="tab-badge" id="badgeTurni" hidden></i>' : ''}</a>`).join('');
}

function render() {
  if (!dati || !c.attivo()) return;
  const [base, param] = location.hash.slice(1).split('/');
  const tab = sezioni().includes(base) ? base : sezioni()[0];
  // Uscita dall'editor con modifiche non salvate: chiedi conferma
  if (editor.sporco && editor.clienteId && !(tab === 'schede' && Number(param) === editor.clienteId)) {
    if (!confirm('Hai modifiche alla scheda non salvate. Vuoi uscire lo stesso?')) {
      history.replaceState(null, '', `#schede/${editor.clienteId}`);
      return;
    }
    editor.sporco = false;
  }
  c.$('.tabs').querySelectorAll('a').forEach((a) => (a.dataset.tab === tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const inAttesa = dati.turni?.ricevute.filter((r) => r.stato === 'in-attesa').length || 0;
  const badge = c.$('#badgeTurni');
  if (badge) { badge.hidden = !inAttesa; badge.textContent = inAttesa; }

  c.impostaTitolo(SEZIONI[tab].titolo, `${ETICHETTE[c.utente.ruolo]} · ${c.fmt(dati.oggi, { weekday: 'long', day: 'numeric', month: 'long' })}`);
  if (tab === 'schede' && param) return renderEditor(Number(param));
  editor.clienteId = null;
  ({ agenda: renderAgenda, turni: renderTurni, attivita: renderAttivita, chiamate: renderChiamate, schede: renderClienti })[tab]();
}

/* ---------- Utilità ---------- */
const giorno = (s) => {
  const n = Math.round((new Date(`${s}T12:00:00Z`) - new Date(`${dati.oggi}T12:00:00Z`)) / 86400000);
  if (n === 0) return 'Oggi';
  if (n === 1) return 'Domani';
  if (n === -1) return 'Ieri';
  const t = c.fmt(s, { weekday: 'long', day: 'numeric', month: 'long' });
  return t[0].toUpperCase() + t.slice(1);
};
const breve = (s) => c.fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });
const e = (s) => c.esc(s);
const vuoto = (titolo, testo) => `<div class="card empty"><strong>${e(titolo)}</strong>${e(testo)}</div>`;

async function azione(promessa, ok) {
  try {
    const r = await promessa;
    if (ok) c.toast(ok);
    return r;
  } catch (ex) {
    if (ex.message !== 'login') c.toast(ex.message);
    throw ex;
  }
}

// Form nel foglio dal basso: raccoglie i campi, invia, chiude e ricarica
function moduloFoglio(titolo, html, invia) {
  c.apriFoglio(titolo, `<form class="sheet-form" novalidate>${html}<p class="form-error" data-err role="alert"></p></form>`);
  const f = c.$('#sheetBody form');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('[type=submit]');
    const err = f.querySelector('[data-err]');
    err.textContent = '';
    btn.disabled = true;
    try {
      await invia(Object.fromEntries(new FormData(f)), f);
    } catch (ex) {
      if (ex.message !== 'login') err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
  return f;
}
const campo = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
const post = (url, body) => c.api(url, { method: 'POST', body: JSON.stringify(body) });

/* =========================================================
   AGENDA + IMPEGNI
   ========================================================= */
function eventiAgenda() {
  const r = c.utente.ruolo;
  let ev = [];
  if (r === 'trainer' || r === 'istruttore') ev = dati.agenda.map((x) => ({ ...x }));
  if (r === 'consulente') ev = dati.consulenze.map((x) => ({ ...x }));
  if (r === 'receptionist') ev = (dati.turni?.miei || []).map((t) => ({ tipo: 'turno', data: t.data, inizio: t.inizio, fine: t.fine, titolo: 'Turno in reception', dettaglio: t.note }));
  ev.push(...dati.impegni.map((i) => ({ tipo: 'impegno', id: i.id, data: i.data, inizio: i.inizio, fine: i.fine, titolo: i.titolo, luogo: i.luogo, dettaglio: i.note })));
  return ev.filter((x) => x.data > dati.oggi || (x.data === dati.oggi && x.fine > dati.adesso))
    .sort((a, b) => (a.data + a.inizio).localeCompare(b.data + b.inizio));
}

const TIPI = {
  impegno: 'Impegno', sala: 'Turno sala', turno: 'Turno', personal: 'Personal', visbody: 'Visbody',
  consulenza: 'Consulenza', 'visita-medica': 'Visita medica', lezione: 'Lezione',
};

function renderAgenda() {
  const ev = eventiAgenda();
  let html = `<button type="button" class="btn btn--primary add-btn" id="nuovoImpegno">+ Nuovo impegno</button>`;
  if (!ev.length) html += vuoto('Agenda libera', 'Non hai impegni nei prossimi giorni.');
  let ultimo = null;
  for (const x of ev) {
    if (x.data !== ultimo) { html += `<h2 class="day-label">${e(giorno(x.data))}</h2>`; ultimo = x.data; }
    html += `
      <article class="card sev sev--${e(x.tipo)}">
        <div class="sev__time"><b>${e(x.inizio)}</b><small>${e(x.fine)}</small></div>
        <div class="sev__body">
          <span class="sev__tag">${e(TIPI[x.tipo] || x.tipo)}</span>
          <h3>${e(x.titolo)}</h3>
          ${x.con || x.luogo ? `<p class="sev__meta">${[x.con && `Con ${e(x.con)}`, x.luogo && e(x.luogo)].filter(Boolean).join(' · ')}</p>` : ''}
          ${x.insieme?.length ? `<p class="sev__meta">Insieme a ${x.insieme.map(e).join(', ')}</p>` : ''}
          ${x.dettaglio ? `<p class="sev__note">${e(x.dettaglio)}</p>` : ''}
          ${x.telefono ? `<a class="chip-link" href="tel:${e(x.telefono.replace(/\s/g, ''))}">☎ ${e(x.telefono)}</a>` : ''}
          ${x.tipo === 'impegno' ? `<button type="button" class="link-btn link-btn--danger" data-del-impegno="${x.id}">Elimina impegno</button>` : ''}
        </div>
      </article>`;
  }
  c.view.innerHTML = html;
  c.$('#nuovoImpegno').addEventListener('click', formImpegno);
  c.view.querySelectorAll('[data-del-impegno]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Eliminare questo impegno?')) return;
    await azione(c.api(`/api/staff/impegni/${b.dataset.delImpegno}`, { method: 'DELETE' }), 'Impegno eliminato');
    await ricarica();
  }));
}

function formImpegno() {
  moduloFoglio('Nuovo impegno', `
    ${campo('Cosa', '<input name="titolo" required maxlength="120" placeholder="Es. Riunione staff, formazione…">')}
    ${campo('Giorno', `<input type="date" name="data" required min="${dati.oggi}" value="${dati.oggi}">`)}
    <div class="field-row">
      ${campo('Dalle', '<input type="time" name="inizio" required value="09:00">')}
      ${campo('Alle', '<input type="time" name="fine" required value="10:00">')}
    </div>
    ${campo('Dove <em>(facoltativo)</em>', '<input name="luogo" maxlength="120">')}
    ${campo('Note <em>(facoltativo)</em>', '<textarea name="note" rows="3" maxlength="1000"></textarea>')}
    <button class="btn btn--primary" type="submit">Aggiungi all'agenda</button>`,
  async (v) => {
    await c.api('/api/staff/impegni', { method: 'POST', body: JSON.stringify(v) });
    c.chiudiFoglio();
    c.toast('Impegno aggiunto');
    await ricarica();
  });
}

/* =========================================================
   TURNI + CAMBI TURNO
   ========================================================= */
const STATI = { 'in-attesa': 'In attesa', accettata: 'Accettata', rifiutata: 'Rifiutata', annullata: 'Annullata' };
const descrTurno = (t) => `${breve(t.data)} · ${t.inizio}–${t.fine}`;

function renderTurni() {
  const t = dati.turni;
  if (!t) { c.view.innerHTML = vuoto('Nessun turno', 'Il tuo ruolo non ha turni.'); return; }
  const bloccati = new Set(t.bloccati);
  const ricevuteAperte = t.ricevute.filter((r) => r.stato === 'in-attesa');
  const ricevuteChiuse = t.ricevute.filter((r) => r.stato !== 'in-attesa');

  const cardRichiesta = (r, mia) => `
    <article class="card req req--${r.stato}">
      <div class="req__top"><span class="pill pill--${r.stato}">${STATI[r.stato]}</span><span class="muted">${r.tipo === 'scambio' ? 'Scambio' : 'Copertura'}</span></div>
      <p class="req__who">${mia ? `A <b>${e(r.collega)}</b>` : `<b>${e(r.richiedente)}</b> ti chiede`} ${r.tipo === 'scambio' ? 'di scambiare' : 'di coprire'}:</p>
      <div class="req__shifts">
        <div><small>${mia ? 'Il tuo turno' : 'Il suo turno'}</small><b>${e(descrTurno(r.turno))}</b></div>
        ${r.turnoCollega ? `<span aria-hidden="true">⇄</span><div><small>${mia ? 'Il suo turno' : 'Il tuo turno'}</small><b>${e(descrTurno(r.turnoCollega))}</b></div>` : ''}
      </div>
      ${r.messaggio ? `<p class="req__msg">“${e(r.messaggio)}”</p>` : ''}
      ${r.risposta ? `<p class="req__msg req__msg--reply">Risposta: “${e(r.risposta)}”</p>` : ''}
      ${!mia && r.stato === 'in-attesa' ? `<div class="req__actions"><button type="button" class="btn btn--ghost" data-rispondi="${r.id}" data-ok="0">Rifiuta</button><button type="button" class="btn btn--primary" data-rispondi="${r.id}" data-ok="1">Accetta</button></div>` : ''}
      ${mia && r.stato === 'in-attesa' ? `<button type="button" class="link-btn link-btn--danger" data-annulla="${r.id}">Annulla richiesta</button>` : ''}
    </article>`;

  let html = '';
  if (ricevuteAperte.length) html += `<h2 class="section-title">Richieste da colleghi</h2>${ricevuteAperte.map((r) => cardRichiesta(r, false)).join('')}`;
  html += `<h2 class="section-title">I tuoi turni</h2>`;
  if (!t.miei.length) html += vuoto('Nessun turno', 'Non hai turni nelle prossime tre settimane.');
  let ultimoGiorno = null;
  html += t.miei.map((x) => {
    const iniziato = x.data < dati.oggi || (x.data === dati.oggi && x.inizio <= dati.adesso);
    const label = x.data !== ultimoGiorno ? (ultimoGiorno = x.data, `<h3 class="shift__day">${e(giorno(x.data))}</h3>`) : '';
    return `${label}
      <article class="card shift">
        <div><b class="shift__time">${e(x.inizio)}–${e(x.fine)}</b><p class="muted">${x.area === 'sala' ? 'Sala attrezzi' : 'Reception'}${x.note ? ` · ${e(x.note)}` : ''}</p></div>
        ${bloccati.has(x.id) ? '<span class="pill pill--in-attesa">Cambio in attesa</span>'
          : iniziato ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-cambio="${x.id}">Chiedi cambio</button>`}
      </article>`;
  }).join('');
  if (t.inviate.length) html += `<h2 class="section-title">Le tue richieste</h2>${t.inviate.map((r) => cardRichiesta(r, true)).join('')}`;
  if (ricevuteChiuse.length) html += `<h2 class="section-title">Risposte date</h2>${ricevuteChiuse.map((r) => cardRichiesta(r, false)).join('')}`;
  c.view.innerHTML = html;

  c.view.querySelectorAll('[data-cambio]').forEach((b) => b.addEventListener('click', () => formCambio(t.miei.find((x) => x.id === Number(b.dataset.cambio)))));
  c.view.querySelectorAll('[data-rispondi]').forEach((b) => b.addEventListener('click', () => rispondi(Number(b.dataset.rispondi), b.dataset.ok === '1')));
  c.view.querySelectorAll('[data-annulla]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Annullare la richiesta?')) return;
    await azione(post(`/api/staff/cambi-turno/${b.dataset.annulla}/annulla`, {}), 'Richiesta annullata');
    await ricarica();
  }));
}

function rispondi(id, accetta) {
  const r = dati.turni.ricevute.find((x) => x.id === id);
  moduloFoglio(accetta ? 'Accetti il cambio?' : 'Rifiuti il cambio?', `
    <p class="muted" style="margin:0 0 6px">${accetta
      ? (r.tipo === 'scambio' ? `Prenderai il turno di ${e(r.richiedente)} (${e(descrTurno(r.turno))}) e ${e(r.richiedente)} prenderà il tuo (${e(descrTurno(r.turnoCollega))}).` : `Prenderai il turno di ${e(r.richiedente)}: ${e(descrTurno(r.turno))}.`)
      : `${e(r.richiedente)} vedrà che hai rifiutato.`}</p>
    ${campo('Messaggio <em>(facoltativo)</em>', `<textarea name="risposta" rows="2" maxlength="500" placeholder="${accetta ? 'Nessun problema!' : 'Mi dispiace, quel giorno non posso.'}"></textarea>`)}
    <button class="btn btn--primary" type="submit">${accetta ? 'Accetta e aggiorna i turni' : 'Rifiuta'}</button>`,
  async (v) => {
    await post(`/api/staff/cambi-turno/${id}/risposta`, { accetta, risposta: v.risposta });
    c.chiudiFoglio();
    c.toast(accetta ? 'Fatto: i turni sono aggiornati' : 'Richiesta rifiutata');
    await ricarica();
  });
}

function formCambio(turno) {
  const t = dati.turni;
  if (!t.colleghi.length) { c.toast('Non ci sono colleghi con il tuo ruolo'); return; }
  const f = moduloFoglio('Chiedi un cambio', `
    <div class="card card--flat"><small class="muted">Il tuo turno</small><b style="display:block">${e(giorno(turno.data))} · ${e(turno.inizio)}–${e(turno.fine)}</b></div>
    ${campo('A chi lo chiedi', `<select name="collega_id" required>${t.colleghi.map((x) => `<option value="${x.id}">${e(x.nome)}</option>`).join('')}</select>`)}
    <fieldset class="choice">
      <legend>Cosa chiedi</legend>
      <label><input type="radio" name="tipo" value="copertura" checked><span><b>Copertura</b><small>Il collega fa il tuo turno</small></span></label>
      <label><input type="radio" name="tipo" value="scambio"><span><b>Scambio</b><small>Tu fai un suo turno in cambio</small></span></label>
    </fieldset>
    <div data-scambio hidden>${campo('Con quale suo turno', '<select name="turno_collega_id"><option value="">Carico i turni…</option></select>')}</div>
    ${campo('Messaggio <em>(facoltativo)</em>', '<textarea name="messaggio" rows="2" maxlength="500" placeholder="Es. Ho una visita medica, mi copri?"></textarea>')}
    <button class="btn btn--primary" type="submit">Invia richiesta</button>`,
  async (v) => {
    if (v.tipo === 'scambio' && !v.turno_collega_id) throw new Error('Scegli con quale turno del collega scambiare.');
    await post('/api/staff/cambi-turno', { ...v, turno_id: turno.id, collega_id: Number(v.collega_id), turno_collega_id: Number(v.turno_collega_id) || null });
    c.chiudiFoglio();
    c.toast('Richiesta inviata');
    await ricarica();
  });

  const boxScambio = f.querySelector('[data-scambio]');
  const sel = f.querySelector('[name=turno_collega_id]');
  const caricaTurniCollega = async () => {
    if (f.tipo.value !== 'scambio') return;
    sel.innerHTML = '<option value="">Carico i turni…</option>';
    try {
      const { turni } = await c.api(`/api/staff/colleghi/${f.collega_id.value}/turni`);
      const bloccati = new Set(t.bloccati);
      const liberi = turni.filter((x) => !bloccati.has(x.id) && !(x.data === dati.oggi && x.inizio <= dati.adesso));
      sel.innerHTML = liberi.length
        ? `<option value="">Scegli un turno</option>${liberi.map((x) => `<option value="${x.id}">${e(breve(x.data))} · ${e(x.inizio)}–${e(x.fine)}</option>`).join('')}`
        : '<option value="">Nessun turno disponibile</option>';
    } catch { sel.innerHTML = '<option value="">Errore nel caricamento</option>'; }
  };
  f.querySelectorAll('[name=tipo]').forEach((r) => r.addEventListener('change', () => { boxScambio.hidden = f.tipo.value !== 'scambio'; caricaTurniCollega(); }));
  f.collega_id.addEventListener('change', caricaTurniCollega);
}

/* =========================================================
   ATTIVITÀ (reception)
   ========================================================= */
const PRIO = { alta: 'Alta', media: 'Media', bassa: 'Bassa' };

function renderAttivita() {
  const aperte = dati.attivita.filter((a) => !a.completata_il);
  const fatte = dati.attivita.filter((a) => a.completata_il);
  const riga = (a) => {
    const scaduta = !a.completata_il && a.scadenza && a.scadenza < dati.oggi;
    return `
      <article class="card task ${a.completata_il ? 'is-done' : ''}">
        <label class="task__check"><input type="checkbox" data-task="${a.id}" ${a.completata_il ? 'checked' : ''} aria-label="Segna come ${a.completata_il ? 'da fare' : 'fatta'}: ${e(a.titolo)}"><span aria-hidden="true"></span></label>
        <div class="task__body">
          <h3>${e(a.titolo)}</h3>
          ${a.descrizione ? `<p class="muted">${e(a.descrizione)}</p>` : ''}
          <p class="task__meta"><span class="prio prio--${a.priorita}">${PRIO[a.priorita]}</span>${a.scadenza ? `<span class="${scaduta ? 'late' : ''}">${scaduta ? 'Scaduta · ' : 'Entro '}${e(giorno(a.scadenza).toLowerCase())}</span>` : ''}</p>
          <button type="button" class="link-btn link-btn--danger" data-del-task="${a.id}">Elimina</button>
        </div>
      </article>`;
  };
  c.view.innerHTML = `
    <button type="button" class="btn btn--primary add-btn" id="nuovaAttivita">+ Nuova attività</button>
    <h2 class="section-title">Da fare · ${aperte.length}</h2>
    ${aperte.length ? aperte.map(riga).join('') : vuoto('Tutto fatto!', 'Non hai attività in sospeso.')}
    ${fatte.length ? `<h2 class="section-title">Fatte di recente</h2>${fatte.map(riga).join('')}` : ''}`;

  c.$('#nuovaAttivita').addEventListener('click', () => moduloFoglio('Nuova attività', `
    ${campo('Cosa c\'è da fare', '<input name="titolo" required maxlength="160" placeholder="Es. Richiamare il fornitore">')}
    ${campo('Dettagli <em>(facoltativo)</em>', '<textarea name="descrizione" rows="3" maxlength="1000"></textarea>')}
    ${campo('Entro il <em>(facoltativo)</em>', `<input type="date" name="scadenza" min="${dati.oggi}" value="${dati.oggi}">`)}
    <fieldset class="choice choice--row"><legend>Priorità</legend>
      ${Object.entries(PRIO).map(([k, v]) => `<label><input type="radio" name="priorita" value="${k}" ${k === 'media' ? 'checked' : ''}><span><b>${v}</b></span></label>`).join('')}
    </fieldset>
    <button class="btn btn--primary" type="submit">Aggiungi</button>`,
  async (v) => {
    await post('/api/staff/attivita', v);
    c.chiudiFoglio();
    c.toast('Attività aggiunta');
    await ricarica();
  }));
  c.view.querySelectorAll('[data-task]').forEach((cb) => cb.addEventListener('change', async () => {
    try { await azione(post(`/api/staff/attivita/${cb.dataset.task}`, { completata: cb.checked }), cb.checked ? 'Fatta ✓' : 'Rimessa tra le cose da fare'); } catch { cb.checked = !cb.checked; return; }
    await ricarica();
  }));
  c.view.querySelectorAll('[data-del-task]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Eliminare questa attività?')) return;
    await azione(c.api(`/api/staff/attivita/${b.dataset.delTask}`, { method: 'DELETE' }), 'Attività eliminata');
    await ricarica();
  }));
}

/* =========================================================
   CHIAMATE (consulenti)
   ========================================================= */
const ESITI = {
  iscritto: 'Si è iscritto', appuntamento: 'Fissato appuntamento', interessato: 'Interessato',
  richiamare: 'Da richiamare', 'non-risponde': 'Non risponde', 'non-interessato': 'Non interessato',
};

function renderChiamate() {
  const da = dati.chiamate.filter((x) => !x.completata_il);
  const fatte = dati.chiamate.filter((x) => x.completata_il);
  const card = (x) => {
    const tardi = !x.completata_il && (x.data < dati.oggi || (x.data === dati.oggi && x.ora && x.ora < dati.adesso));
    return `
      <article class="card call ${x.completata_il ? 'is-done' : ''}">
        <div class="call__top"><h3>${e(x.cliente_nome)}</h3><span class="${tardi ? 'late' : 'muted'}">${tardi ? 'In ritardo · ' : ''}${e(giorno(x.data))}${x.ora ? ` · ${e(x.ora)}` : ''}</span></div>
        <p class="call__why">${e(x.motivo)}</p>
        ${x.esito ? `<p class="call__esito"><span class="pill pill--esito">${e(ESITI[x.esito] || x.esito)}</span></p>` : ''}
        ${x.note ? `<p class="sev__note">${e(x.note)}</p>` : ''}
        <div class="call__actions">
          <a class="btn btn--ghost btn--sm" href="tel:${e(x.telefono.replace(/\s/g, ''))}">☎ ${e(x.telefono)}</a>
          <button type="button" class="btn ${x.completata_il ? 'btn--ghost' : 'btn--primary'} btn--sm" data-esito="${x.id}">${x.completata_il ? 'Modifica esito' : 'Registra esito'}</button>
        </div>
      </article>`;
  };
  c.view.innerHTML = `
    <button type="button" class="btn btn--primary add-btn" id="nuovaChiamata">+ Nuova chiamata</button>
    <h2 class="section-title">Da fare · ${da.length}</h2>
    ${da.length ? da.map(card).join('') : vuoto('Nessuna chiamata in sospeso', 'Aggiungine una con il pulsante sopra.')}
    ${fatte.length ? `<h2 class="section-title">Fatte di recente</h2>${fatte.map(card).join('')}` : ''}`;

  c.$('#nuovaChiamata').addEventListener('click', () => moduloFoglio('Nuova chiamata', `
    ${campo('Nome', '<input name="cliente_nome" required maxlength="120" autocomplete="off">')}
    ${campo('Telefono', '<input type="tel" name="telefono" required maxlength="40" inputmode="tel" autocomplete="off">')}
    ${campo('Motivo', '<input name="motivo" required maxlength="300" placeholder="Es. Lead Instagram, rinnovo abbonamento…">')}
    <div class="field-row">
      ${campo('Giorno', `<input type="date" name="data" required value="${dati.oggi}">`)}
      ${campo('Ora <em>(facolt.)</em>', '<input type="time" name="ora">')}
    </div>
    <button class="btn btn--primary" type="submit">Aggiungi alla lista</button>`,
  async (v) => {
    await post('/api/staff/chiamate', v);
    c.chiudiFoglio();
    c.toast('Chiamata aggiunta');
    await ricarica();
  }));

  c.view.querySelectorAll('[data-esito]').forEach((b) => b.addEventListener('click', () => {
    const x = dati.chiamate.find((k) => k.id === Number(b.dataset.esito));
    moduloFoglio(`Chiamata a ${x.cliente_nome}`, `
      <fieldset class="choice choice--grid"><legend>Com'è andata?</legend>
        ${Object.entries(ESITI).map(([k, v]) => `<label><input type="radio" name="esito" value="${k}" ${x.esito === k ? 'checked' : ''}><span><b>${v}</b></span></label>`).join('')}
      </fieldset>
      ${campo('Note', `<textarea name="note" rows="4" maxlength="1000" placeholder="Cosa vi siete detti, cosa fare dopo…">${e(x.note || '')}</textarea>`)}
      <button class="btn btn--primary" type="submit">Salva</button>
      ${x.completata_il ? '<button class="btn btn--ghost" type="button" data-riapri>Rimetti tra le chiamate da fare</button>' : ''}`,
    async (v) => {
      if (!v.esito) throw new Error("Scegli com'è andata la chiamata.");
      await post(`/api/staff/chiamate/${x.id}`, v);
      c.chiudiFoglio();
      c.toast('Esito salvato');
      await ricarica();
    });
    c.$('#sheetBody [data-riapri]')?.addEventListener('click', async () => {
      await azione(post(`/api/staff/chiamate/${x.id}`, { esito: '', note: x.note }), 'Rimessa tra le chiamate da fare');
      c.chiudiFoglio();
      await ricarica();
    });
  }));
}

/* =========================================================
   SCHEDE (trainer): elenco clienti + editor
   ========================================================= */
let clienti = null;
let filtro = '';

async function renderClienti() {
  c.view.innerHTML = '<p class="muted" style="padding:20px 4px">Carico i clienti…</p>';
  try { ({ clienti } = await c.api('/api/staff/clienti')); } catch (ex) { if (ex.message !== 'login') c.view.innerHTML = vuoto('Errore', ex.message); return; }
  const disegna = () => {
    const q = filtro.trim().toLowerCase();
    const lista = clienti.filter((k) => !q || `${k.nome} ${k.cognome} ${k.email}`.toLowerCase().includes(q));
    c.$('#listaClienti').innerHTML = lista.length ? lista.map((k) => `
      <a class="card client" href="#schede/${k.id}">
        <span class="client__avatar" aria-hidden="true">${e((k.nome[0] + k.cognome[0]).toUpperCase())}</span>
        <span class="client__body"><b>${e(k.nome)} ${e(k.cognome)}</b>
          <small>${k.scheda_id ? `${e(k.titolo)}${k.fine ? ` · fino al ${e(c.fmt(k.fine, { day: 'numeric', month: 'short' }))}` : ''}` : '<span class="late">Nessuna scheda attiva</span>'}</small></span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </a>`).join('') : vuoto('Nessun cliente trovato', 'Prova con un altro nome.');
  };
  c.view.innerHTML = `
    <label class="search"><span class="sr-only">Cerca cliente</span><input type="search" id="cercaCliente" placeholder="Cerca un cliente…" value="${e(filtro)}" autocomplete="off"></label>
    <p class="section-title">${clienti.length} clienti</p>
    <div id="listaClienti"></div>`;
  disegna();
  c.$('#cercaCliente').addEventListener('input', (ev) => { filtro = ev.target.value; disegna(); });
}

const esercizioVuoto = () => ({ id: null, nome: '', serie: 3, ripetizioni: '10', recupero: 60, note: '', conPeso: true });
const giornoVuoto = (n) => ({ id: null, nome: `${String.fromCharCode(65 + n)} · `, esercizi: [esercizioVuoto()] });

async function renderEditor(clienteId) {
  if (editor.clienteId !== clienteId) {
    c.view.innerHTML = '<p class="muted" style="padding:20px 4px">Carico la scheda…</p>';
    let r;
    try { r = await c.api(`/api/staff/clienti/${clienteId}/scheda`); } catch (ex) { if (ex.message !== 'login') c.view.innerHTML = vuoto('Errore', ex.message); return; }
    const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    Object.assign(editor, {
      clienteId, cliente: r.cliente, esistente: !!r.scheda, sporco: false,
      scheda: r.scheda ? structuredClone(r.scheda) : { titolo: '', obiettivo: '', inizio: dati.oggi, fine: plus(dati.oggi, 56), note: '', giorni: [giornoVuoto(0)] },
    });
  }
  c.impostaTitolo('Scheda', editor.cliente.nome);
  disegnaEditor();
}

function disegnaEditor() {
  const s = editor.scheda;
  const rec = (v) => (v == null || v === '' ? '' : v);
  c.view.innerHTML = `
    <a class="back-link" href="#schede">‹ Tutti i clienti</a>
    <form id="schedaForm" class="plan-editor" novalidate>
      <section class="card">
        <div class="kicker">${editor.esistente ? 'Modifica la scheda attiva' : 'Nuova scheda'}</div>
        ${campo('Titolo', `<input name="titolo" data-f="titolo" required maxlength="120" value="${e(s.titolo)}" placeholder="Es. Ipertrofia · 3 giorni">`)}
        ${campo('Obiettivo', `<input name="obiettivo" data-f="obiettivo" maxlength="120" value="${e(s.obiettivo || '')}" placeholder="Es. Aumento massa muscolare">`)}
        <div class="field-row">
          ${campo('Dal', `<input type="date" data-f="inizio" required value="${e(s.inizio)}">`)}
          ${campo('Al', `<input type="date" data-f="fine" value="${e(s.fine || '')}">`)}
        </div>
        ${campo('Note generali per il cliente', `<textarea data-f="note" rows="3" maxlength="2000" placeholder="Es. Riscaldamento di 10 minuti prima di iniziare">${e(s.note || '')}</textarea>`)}
      </section>

      ${s.giorni.map((g, gi) => `
        <section class="card day-card">
          <div class="day-card__head">
            ${campo(`Giorno ${gi + 1}`, `<input data-g="${gi}" data-f="nome" required maxlength="80" value="${e(g.nome)}" placeholder="Es. A · Petto e tricipiti">`)}
            ${s.giorni.length > 1 ? `<button type="button" class="icon-btn icon-btn--danger" data-del-giorno="${gi}" aria-label="Elimina giorno ${gi + 1}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ''}
          </div>
          <ol class="ex-edit-list">
            ${g.esercizi.map((x, ei) => `
              <li class="ex-edit">
                <div class="ex-edit__head">
                  <span class="ex-edit__n">Esercizio ${ei + 1}</span>
                  <div class="ex-edit__tools">
                    <button type="button" class="icon-btn icon-btn--sm" data-move="${gi}:${ei}:-1" ${ei === 0 ? 'disabled' : ''} aria-label="Sposta su">↑</button>
                    <button type="button" class="icon-btn icon-btn--sm" data-move="${gi}:${ei}:1" ${ei === g.esercizi.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">↓</button>
                    <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-del-es="${gi}:${ei}" aria-label="Elimina esercizio">✕</button>
                  </div>
                </div>
                <input class="ex-edit__name" data-g="${gi}" data-e="${ei}" data-f="nome" required maxlength="120" value="${e(x.nome)}" placeholder="Nome esercizio" aria-label="Nome esercizio ${ei + 1}">
                <div class="ex-edit__grid">
                  <label><span>Serie</span><input type="number" inputmode="numeric" min="1" max="20" data-g="${gi}" data-e="${ei}" data-f="serie" value="${e(x.serie)}"></label>
                  <label><span>Ripetizioni</span><input data-g="${gi}" data-e="${ei}" data-f="ripetizioni" maxlength="30" value="${e(x.ripetizioni)}" placeholder="10, 8-12, 30 sec"></label>
                  <label><span>Recupero (sec)</span><input type="number" inputmode="numeric" min="0" max="900" step="15" data-g="${gi}" data-e="${ei}" data-f="recupero" value="${rec(x.recupero)}"></label>
                </div>
                <label class="ex-edit__note"><span>Nota per il cliente</span>
                  <textarea rows="2" maxlength="500" data-g="${gi}" data-e="${ei}" data-f="note" placeholder="Es. Scapole addotte, scendi lento in 3 secondi">${e(x.note || '')}</textarea></label>
                <div class="ex-edit__foot">
                  <label class="toggle"><input type="checkbox" data-g="${gi}" data-e="${ei}" data-f="conPeso" ${x.conPeso ? 'checked' : ''}><span>Il cliente segna il peso</span></label>
                  ${x.ultimo ? `<small class="muted">Ultimo peso del cliente: <b>${c.kg(x.ultimo.peso_kg)} kg</b></small>` : ''}
                </div>
              </li>`).join('')}
          </ol>
          <button type="button" class="btn btn--ghost btn--sm add-ex" data-add-es="${gi}">+ Aggiungi esercizio</button>
        </section>`).join('')}

      ${s.giorni.length < 7 ? '<button type="button" class="btn btn--ghost add-btn" id="addGiorno">+ Aggiungi giorno</button>' : ''}
      <p class="form-error" id="schedaErr" role="alert"></p>
      <div class="save-bar">
        ${editor.esistente ? '<button type="button" class="btn btn--ghost" id="salvaNuova">Salva come nuova</button>' : ''}
        <button type="submit" class="btn btn--primary">${editor.esistente ? 'Salva modifiche' : 'Crea scheda'}</button>
      </div>
    </form>`;

  const f = c.$('#schedaForm');
  // Ogni campo aggiorna lo stato dell'editor (così i ridisegni non perdono ciò che è stato scritto)
  f.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset.f) return;
    const val = el.type === 'checkbox' ? el.checked : el.value;
    const g = el.dataset.g != null ? editor.scheda.giorni[Number(el.dataset.g)] : null;
    const target = el.dataset.e != null ? g.esercizi[Number(el.dataset.e)] : g || editor.scheda;
    target[el.dataset.f] = val;
    editor.sporco = true;
  });
  f.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const s2 = editor.scheda;
    if (b.dataset.addEs != null) {
      s2.giorni[Number(b.dataset.addEs)].esercizi.push(esercizioVuoto());
      editor.sporco = true; disegnaEditor();
      c.view.querySelectorAll(`.day-card`)[Number(b.dataset.addEs)].querySelector('.ex-edit:last-child .ex-edit__name').focus();
    } else if (b.dataset.move) {
      const [gi, ei, d] = b.dataset.move.split(':').map(Number);
      const l = s2.giorni[gi].esercizi;
      [l[ei], l[ei + d]] = [l[ei + d], l[ei]];
      editor.sporco = true; disegnaEditor();
    } else if (b.dataset.delEs) {
      const [gi, ei] = b.dataset.delEs.split(':').map(Number);
      const x = s2.giorni[gi].esercizi[ei];
      if (s2.giorni[gi].esercizi.length === 1) { c.toast('Un giorno deve avere almeno un esercizio'); return; }
      if (x.ultimo && !confirm(`Il cliente ha già segnato dei pesi per "${x.nome}". Se lo elimini, quei pesi vengono cancellati. Continuare?`)) return;
      s2.giorni[gi].esercizi.splice(ei, 1);
      editor.sporco = true; disegnaEditor();
    } else if (b.dataset.delGiorno != null) {
      const gi = Number(b.dataset.delGiorno);
      if (!confirm(`Eliminare il giorno "${s2.giorni[gi].nome}" e tutti i suoi esercizi?`)) return;
      s2.giorni.splice(gi, 1);
      editor.sporco = true; disegnaEditor();
    } else if (b.id === 'addGiorno') {
      s2.giorni.push(giornoVuoto(s2.giorni.length));
      editor.sporco = true; disegnaEditor();
      c.view.querySelectorAll('.day-card').item(s2.giorni.length - 1).scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (b.id === 'salvaNuova') {
      if (confirm('La scheda attuale verrà archiviata e il cliente vedrà questa come nuova scheda (lo storico dei pesi ripartirà da zero). Continuare?')) salvaScheda(true);
    }
  });
  f.addEventListener('submit', (ev) => { ev.preventDefault(); salvaScheda(false); });
}

async function salvaScheda(nuova) {
  const err = c.$('#schedaErr');
  err.textContent = '';
  const s = editor.scheda;
  const body = {
    nuova, titolo: s.titolo, obiettivo: s.obiettivo, inizio: s.inizio, fine: s.fine || null, note: s.note,
    giorni: s.giorni.map((g) => ({
      id: nuova ? null : g.id, nome: g.nome,
      esercizi: g.esercizi.map((x) => ({
        id: nuova ? null : x.id, nome: x.nome, serie: Number(x.serie), ripetizioni: String(x.ripetizioni ?? ''),
        recupero: x.recupero === '' || x.recupero == null ? null : Number(x.recupero), note: x.note, conPeso: !!x.conPeso,
      })),
    })),
  };
  c.view.querySelectorAll('.save-bar button').forEach((b) => (b.disabled = true));
  try {
    await c.api(`/api/staff/clienti/${editor.clienteId}/scheda`, { method: 'PUT', body: JSON.stringify(body) });
    editor.sporco = false;
    editor.clienteId = null; // ricarica dal server con gli id aggiornati
    c.toast(nuova || !editor.esistente ? 'Scheda creata: il cliente la vede già' : 'Scheda aggiornata');
    await renderEditor(Number(location.hash.split('/')[1]));
  } catch (ex) {
    if (ex.message !== 'login') { err.textContent = ex.message; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  } finally {
    c.view.querySelectorAll('.save-bar button').forEach((b) => (b.disabled = false));
  }
}
