/* Area riservata: una pagina, contenuti diversi per ogni ruolo */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const anim = !!window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const diffGiorni = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
  const addGiorni = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const lunga = (s) => { const d = parse(s); return `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`; };
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  let OGGI = '';
  let ADESSO = '';
  const etichettaGiorno = (s) => {
    const n = diffGiorni(s, OGGI);
    if (n === 0) return 'Oggi';
    if (n === 1) return 'Domani';
    if (n === -1) return 'Ieri';
    return lunga(s).replace(/^./, (c) => c.toUpperCase());
  };
  const quando = (e) => {
    const n = diffGiorni(e.data, OGGI);
    if (n === 0) return e.inizio <= ADESSO ? 'in corso' : `oggi alle ${e.inizio}`;
    if (n === 1) return `domani alle ${e.inizio}`;
    return `tra ${n} giorni`;
  };

  const TIPI = {
    visbody: { nome: 'Visbody', cls: 't-visbody' },
    'visita-medica': { nome: 'Visita medica', cls: 't-medica' },
    consulenza: { nome: 'Consulenza', cls: 't-consulenza' },
    personal: { nome: 'Personal', cls: 't-personal' },
    sala: { nome: 'Turno sala', cls: 't-sala' },
    lezione: { nome: 'Lezione', cls: 't-lezione' },
    reception: { nome: 'Reception', cls: 't-sala' },
    impegno: { nome: 'Impegno', cls: 't-impegno' },
  };

  const api = async (url, opts = {}) => {
    const r = await fetch(url, { credentials: 'same-origin', ...opts });
    if (r.status === 401) { location.href = '/accedi'; throw new Error('Sessione scaduta'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.errore || 'Qualcosa è andato storto, riprova.');
    return j;
  };
  const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  /* ---------------- Componenti ---------------- */
  const kpi = (label, valore, nota = '', accent = false) =>
    `<div class="kpi ${accent ? 'kpi--accent' : ''}"><small>${esc(label)}</small><strong>${valore}</strong>${nota ? `<span>${esc(nota)}</span>` : ''}</div>`;

  const sezione = (titolo, contenuto, extra = '') =>
    `<section class="panel"><div class="panel__head"><h2>${esc(titolo)}</h2>${extra}</div>${contenuto}</section>`;

  function evento(e) {
    const t = TIPI[e.tipo] || { nome: e.tipo, cls: '' };
    const inCorso = e.data === OGGI && e.inizio <= ADESSO && e.fine > ADESSO;
    const durata = toMin(e.fine) - toMin(e.inizio);
    return `
      <article class="ev ${t.cls} ${inCorso ? 'is-now' : ''}" data-tipo="${esc(e.tipo)}">
        <div class="ev__time"><strong>${esc(e.inizio)}</strong><span>${esc(e.fine)}</span></div>
        <div class="ev__body">
          <div class="ev__top"><span class="ev__tag">${esc(t.nome)}</span>${inCorso ? '<span class="ev__now">In corso</span>' : ''}<span class="ev__dur">${durata} min</span></div>
          <h3>${esc(e.titolo)}</h3>
          <p class="ev__meta">
            ${e.con ? `<span>Con <b>${esc(e.con)}</b></span>` : ''}
            ${e.luogo ? `<span>${esc(e.luogo)}</span>` : ''}
          </p>
          ${e.insieme ? `<p class="ev__team">${e.insieme.length ? `Insieme a ${e.insieme.map((n) => `<span class="mini-chip">${esc(n)}</span>`).join('')}` : '<span class="mini-chip mini-chip--solo">Conduci da solo/a</span>'}</p>` : ''}
          ${e.dettaglio ? `<p class="ev__note">${esc(e.dettaglio)}</p>` : ''}
          ${e.telefono || e.codice ? `<p class="ev__actions">${e.telefono ? `<a href="tel:${esc(e.telefono.replace(/\s/g, ''))}">☎ ${esc(e.telefono)}</a>` : ''}${e.codice ? `<span class="ev__code">${esc(e.codice)}</span>` : ''}</p>` : ''}
        </div>
      </article>`;
  }

  function agenda(eventi, vuoto = 'Nessun impegno in programma.') {
    if (!eventi.length) return `<p class="empty">${esc(vuoto)}</p>`;
    const perGiorno = new Map();
    for (const e of eventi) { if (!perGiorno.has(e.data)) perGiorno.set(e.data, []); perGiorno.get(e.data).push(e); }
    return `<div class="agenda">${[...perGiorno].map(([d, lista]) => `
      <div class="agenda__day ${d === OGGI ? 'is-today' : ''}">
        <div class="agenda__label"><strong>${esc(etichettaGiorno(d))}</strong>${diffGiorni(d, OGGI) <= 1 ? `<span>${esc(lunga(d))}</span>` : ''}</div>
        <div class="agenda__list">${lista.map(evento).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function filtri(tipi, target) {
    return `<div class="dash-filters" data-target="${target}" role="group" aria-label="Filtra">
      <button type="button" aria-pressed="true" data-f="all">Tutto</button>
      ${tipi.map(([k, n, c]) => `<button type="button" aria-pressed="false" data-f="${k}"><i class="dot ${TIPI[k].cls}"></i>${esc(TIPI[k].nome)}<sup>${c}</sup></button>`).join('')}
    </div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.dash-filters button');
    if (!b) return;
    const box = b.parentElement;
    box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const root = document.getElementById(box.dataset.target);
    root.querySelectorAll('.ev').forEach((ev) => (ev.hidden = b.dataset.f !== 'all' && ev.dataset.tipo !== b.dataset.f));
    root.querySelectorAll('.agenda__day').forEach((d) => (d.hidden = !d.querySelector('.ev:not([hidden])')));
  });

  /* ---------------- Viste per ruolo ---------------- */
  const viste = {
    cliente(d) {
      const prossimo = d.appuntamenti[0];
      const vb = d.appuntamenti.find((a) => a.tipo === 'visbody');
      return {
        sub: d.appuntamenti.length ? `Hai ${d.appuntamenti.length} appuntament${d.appuntamenti.length === 1 ? 'o' : 'i'} in programma.` : 'Non hai appuntamenti in programma.',
        kpis: [
          kpi('Prossimo appuntamento', prossimo ? esc(TIPI[prossimo.tipo].nome) : '—', prossimo ? quando(prossimo) : '', true),
          kpi('In programma', d.appuntamenti.length),
          kpi('Prossimo Visbody', vb ? esc(etichettaGiorno(vb.data)) : '—', vb ? `ore ${vb.inizio}` : 'non prenotato'),
        ],
        // Scheda e ultima visita arrivano da /api/app: si riempiono subito dopo (vedi caricaClienteExtra)
        body: `${sezione('La tua scheda', '<p class="empty">Caricamento della scheda…</p>', '<span class="panel__hint" id="planHint"></span>').replace('<section class="panel">', '<section class="panel" id="planPanel">')}
        <div class="dash-grid dash-grid--wide">
          ${sezione('I tuoi appuntamenti', agenda(d.appuntamenti, 'Non hai appuntamenti in programma.'))}
          <div class="dash-side">
            <div id="visitBox"></div>
            <a class="promo" href="/app/"><strong>Scheda e pesi sul telefono</strong><span>Aprila e aggiungila alla schermata Home →</span></a>
            <a class="promo" href="/visbody#prenota"><small>Visbody</small><strong>Prenota la tua analisi corporea</strong><span>Scegli trainer, giorno e ora →</span></a>
            <div class="promo promo--light"><small>Visita medica sportiva</small><strong>Serve il certificato?</strong><span>Chiedi in reception o chiama il <a href="tel:+393393589451">339 358 9451</a></span></div>
            ${d.storico.length ? sezione('Storico', `<ul class="history">${d.storico.map((s) => `<li><i class="dot ${TIPI[s.tipo].cls}"></i><span><b>${esc(s.titolo)}</b>${esc(lunga(s.data))}${s.con ? ` · ${esc(s.con)}` : ''}</span></li>`).join('')}</ul>`) : ''}
          </div>
        </div>`,
      };
    },

    receptionist(d) {
      const turnoOggi = d.turni.find((t) => t.data === OGGI);
      const aperte = d.attivita.filter((a) => !a.completata_il);
      const urgenti = aperte.filter((a) => a.priorita === 'alta').length;
      const giorni = Array.from({ length: 14 }, (_, i) => addGiorni(OGGI, i));
      const turniHtml = `<ul class="shifts">${giorni.map((g) => {
        const t = d.turni.filter((x) => x.data === g);
        const dd = parse(g);
        return `<li class="${g === OGGI ? 'is-today' : ''} ${t.length ? '' : 'is-off'}">
          <span class="shifts__day"><b>${GIORNI[dd.getUTCDay()].slice(0, 3)}</b>${dd.getUTCDate()}</span>
          ${t.length ? t.map((x) => `<span class="shifts__pill ${toMin(x.inizio) < 12 * 60 ? 'is-am' : 'is-pm'}">${esc(x.inizio)} – ${esc(x.fine)}</span><span class="shifts__note">${esc(x.note || '')}</span>`).join('') : '<span class="shifts__off">Riposo</span>'}
        </li>`;
      }).join('')}</ul>`;
      return {
        sub: !turnoOggi ? 'Oggi sei di riposo.'
          : turnoOggi.fine <= ADESSO ? `Il tuo turno di oggi è finito alle ${turnoOggi.fine}.`
          : turnoOggi.inizio <= ADESSO ? `Sei in turno fino alle ${turnoOggi.fine}.`
          : `Oggi sei in reception dalle ${turnoOggi.inizio} alle ${turnoOggi.fine}.`,
        kpis: [
          kpi('Turno di oggi', turnoOggi ? `${esc(turnoOggi.inizio)}–${esc(turnoOggi.fine)}` : 'Riposo', turnoOggi?.note || '', true),
          kpi('Attività in sospeso', aperte.length, urgenti ? `${urgenti} urgent${urgenti === 1 ? 'e' : 'i'}` : 'nessuna urgente'),
          kpi('Visbody oggi', d.visbodyOggi, 'da accogliere in reception'),
        ],
        body: `<div class="dash-grid">
          ${sezione('I miei turni', turniHtml, '<span class="panel__hint">prossime 2 settimane</span>')}
          ${sezione('Attività in sospeso', tasks(d.attivita), `<span class="panel__hint" id="taskCount">${aperte.length} da fare</span>`)}
        </div>`,
      };
    },

    consulente(d) {
      const aperte = d.chiamate.filter((c) => !c.completata_il);
      const ritardo = aperte.filter((c) => c.data < OGGI).length;
      const oggi = aperte.filter((c) => c.data <= OGGI).length;
      return {
        sub: oggi ? `Hai ${oggi} chiamat${oggi === 1 ? 'a' : 'e'} da fare entro oggi.` : 'Nessuna chiamata in scadenza oggi.',
        kpis: [
          kpi('Chiamate entro oggi', oggi, ritardo ? `${ritardo} in ritardo` : 'tutto in pari', true),
          kpi('Chiamate in coda', aperte.length, 'prossimi giorni inclusi'),
          kpi('Consulenze', d.consulenze.length, d.consulenze[0] ? `prossima ${quando(d.consulenze[0])}` : 'nessuna in programma'),
        ],
        body: `<div class="dash-grid">
          ${sezione('Chiamate da fare', calls(d.chiamate), `<span class="panel__hint" id="callCount">${aperte.length} aperte</span>`)}
          ${sezione('Consulenze in agenda', agenda(d.consulenze, 'Nessuna consulenza in programma.'))}
        </div>`,
      };
    },

    trainer(d) {
      const conta = (t) => d.agenda.filter((e) => e.tipo === t).length;
      const oggi = d.agenda.filter((e) => e.data === OGGI);
      const prossimo = d.agenda[0];
      const settimana = addGiorni(OGGI, 7);
      const oreSala = d.agenda.filter((e) => e.tipo === 'sala' && e.data < settimana).reduce((s, e) => s + (toMin(e.fine) - toMin(e.inizio)), 0) / 60;
      return {
        sub: oggi.length ? `Oggi hai ${oggi.length} impegn${oggi.length === 1 ? 'o' : 'i'}.` : 'Oggi non hai impegni in agenda.',
        kpis: [
          kpi('Prossimo impegno', prossimo ? esc(TIPI[prossimo.tipo].nome) : '—', prossimo ? quando(prossimo) : '', true),
          kpi('Ore in sala', `${oreSala.toLocaleString('it-IT')}h`, 'prossimi 7 giorni'),
          kpi('Personal', conta('personal'), 'prossime 3 settimane'),
          kpi('Visbody', conta('visbody'), 'prenotati con te'),
        ],
        body: sezione('La mia agenda', `<div id="agTrainer">${agenda(d.agenda)}</div>`,
          filtri([['sala', 0, conta('sala')], ['personal', 0, conta('personal')], ['visbody', 0, conta('visbody')]], 'agTrainer')),
      };
    },

    istruttore(d) {
      const sett = addGiorni(OGGI, 7);
      const questaSett = d.agenda.filter((e) => e.data < sett);
      const condivise = d.agenda.filter((e) => e.insieme?.length).length;
      const prossima = d.agenda[0];
      return {
        sub: prossima ? `La tua prossima lezione è ${esc(prossima.titolo)}, ${quando(prossima)}.` : 'Non hai lezioni assegnate.',
        kpis: [
          kpi('Prossima lezione', prossima ? esc(prossima.titolo) : '—', prossima ? quando(prossima) : '', true),
          kpi('Lezioni', questaSett.length, 'prossimi 7 giorni'),
          kpi('In co-conduzione', condivise, 'su 3 settimane'),
          kpi('Corsi assegnati', d.corsi.length),
        ],
        body: `
          ${sezione('I miei corsi', `<div class="my-courses">${d.corsi.map((c) => `
            <article class="my-course">
              <div class="my-course__img"><img src="${esc(c.img)}" alt="" loading="lazy"></div>
              <div class="my-course__body">
                <h3>${esc(c.nome)}</h3>
                <p>${c.mie} lezioni assegnate a te</p>
                <div class="my-course__team"><small>Istruttori del corso</small>${c.istruttori.map((i) => `<span class="mini-chip ${i.io ? 'mini-chip--me' : ''}">${i.io ? 'Tu' : esc(i.nome)}</span>`).join('')}</div>
              </div>
            </article>`).join('')}</div>`)}
          ${sezione('Orari assegnati', `<div id="agIstr">${agenda(d.agenda, 'Nessuna lezione assegnata.')}</div>`)}`,
      };
    },
  };

  /* Attività della reception */
  function tasks(lista) {
    if (!lista.length) return '<p class="empty">Nessuna attività. Ottimo lavoro!</p>';
    return `<ul class="tasks">${lista.map((a) => {
      const late = !a.completata_il && a.scadenza && a.scadenza < OGGI;
      const scad = a.completata_il ? 'Fatta' : a.scadenza ? (late ? 'Scaduta' : etichettaGiorno(a.scadenza)) : '';
      return `<li class="task ${a.completata_il ? 'is-done' : ''} p-${esc(a.priorita)}">
        <label>
          <input type="checkbox" data-task="${a.id}" ${a.completata_il ? 'checked' : ''}>
          <span class="task__box" aria-hidden="true"></span>
          <span class="task__txt"><b>${esc(a.titolo)}</b>${a.descrizione ? `<small>${esc(a.descrizione)}</small>` : ''}</span>
        </label>
        <span class="task__meta"><i class="prio">${esc(a.priorita)}</i>${scad ? `<em class="${late ? 'late' : ''}">${esc(scad)}</em>` : ''}</span>
      </li>`;
    }).join('')}</ul>`;
  }
  document.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-task]');
    if (!cb) return;
    const li = cb.closest('.task');
    li.classList.toggle('is-done', cb.checked);
    try {
      await post(`/api/area/attivita/${cb.dataset.task}`, { completata: cb.checked });
      const n = document.querySelectorAll('.task:not(.is-done)').length;
      $('taskCount').textContent = `${n} da fare`;
    } catch (err) {
      cb.checked = !cb.checked;
      li.classList.toggle('is-done', cb.checked);
      alert(err.message);
    }
  });

  /* Chiamate del consulente */
  const ESITI = { iscritto: 'Si è iscritto', appuntamento: 'Fissata consulenza', interessato: 'Interessato', richiamare: 'Da richiamare', 'non-risponde': 'Non risponde', 'non-interessato': 'Non interessato' };
  function calls(lista) {
    if (!lista.length) return '<p class="empty">Nessuna chiamata da fare.</p>';
    return `<ul class="calls">${lista.map((c) => {
      const late = !c.completata_il && c.data < OGGI;
      return `<li class="call ${c.completata_il ? 'is-done' : ''}" data-call="${c.id}">
        <div class="call__main">
          <div class="call__who"><b>${esc(c.cliente_nome)}</b><span class="call__when ${late ? 'late' : ''}">${late ? 'In ritardo · ' : ''}${esc(etichettaGiorno(c.data))}${c.ora ? ` · ${esc(c.ora)}` : ''}</span></div>
          <p>${esc(c.motivo)}</p>
          ${c.completata_il ? `<span class="call__esito">${esc(ESITI[c.esito] || 'Fatta')}</span>` : ''}
        </div>
        <div class="call__actions">
          ${c.completata_il
            ? '<button type="button" class="link-btn" data-undo>Riapri</button>'
            : `<a class="btn call__btn" href="tel:${esc(c.telefono.replace(/\s/g, ''))}">☎ ${esc(c.telefono)}</a>
               <select data-esito aria-label="Esito chiamata con ${esc(c.cliente_nome)}"><option value="">Esito…</option>${Object.entries(ESITI).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`}
        </div>
      </li>`;
    }).join('')}</ul>`;
  }
  async function aggiornaChiamata(id, esito) {
    try { await post(`/api/area/chiamate/${id}`, { esito }); await carica(); } catch (err) { alert(err.message); }
  }
  document.addEventListener('change', (e) => { const s = e.target.closest('[data-esito]'); if (s && s.value) aggiornaChiamata(s.closest('[data-call]').dataset.call, s.value); });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-undo]'); if (b) aggiornaChiamata(b.closest('[data-call]').dataset.call, ''); });

  /* ---------------- Cliente: scheda con pesi + ultima visita (stessi dati dell'app, /api/app) ---------------- */
  const kg = (n) => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));
  const num = (n, dec = 1) => (n == null ? '—' : n.toLocaleString('it-IT', { maximumFractionDigits: dec }));
  const breve = (s) => { const d = parse(s); return `${d.getUTCDate()} ${MESI[d.getUTCMonth()].slice(0, 3)}`; };
  const fa = (s) => { const n = diffGiorni(OGGI, s); return n === 0 ? 'oggi' : n === 1 ? 'ieri' : n < 14 ? `${n} giorni fa` : `il ${breve(s)}`; };
  const durataRec = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const put = (url, body) => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const cliente = { scheda: null, giorno: null };
  const giornoConsigliato = (s) => [...s.giorni].sort((a, b) => (a.ultimaSeduta || '').localeCompare(b.ultimaSeduta || ''))[0];
  const titoloGiorno = (g) => ({ lettera: g.nome.split('·')[0].trim(), nome: g.nome.split('·').slice(1).join('·').trim() || g.nome });

  async function caricaClienteExtra() {
    let d;
    try { d = await api('/api/app'); } catch (e) {
      $('planPanel').querySelector('.empty').textContent = e.message;
      return;
    }
    cliente.scheda = d.scheda;
    renderScheda();
    // Un recupero rimasto aperto (pagina ricaricata) riprende da dove era
    import('/app/timer.js').then((t) => t.ripristina()).catch(() => {});
    renderVisita(d.visite);
  }

  function renderScheda() {
    const s = cliente.scheda;
    const box = $('planPanel');
    const corpo = box.querySelector('.panel__head').nextElementSibling;
    if (!s) { corpo.outerHTML = '<p class="empty">Non hai ancora una scheda attiva: chiedi al tuo trainer di prepararla.</p>'; return; }
    if (!s.giorni.some((g) => g.id === cliente.giorno)) cliente.giorno = giornoConsigliato(s).id;
    const g = s.giorni.find((x) => x.id === cliente.giorno);
    const conPeso = g.esercizi.filter((e) => e.conPeso).length;
    const fatti = g.esercizi.filter((e) => e.oggi != null).length;
    $('planHint').textContent = `${s.titolo}${s.trainer ? ` · preparata da ${s.trainer}` : ''}`;

    corpo.outerHTML = `<div class="plan" id="planBody">
      <div class="plan__days" role="group" aria-label="Giorno di allenamento">
        ${s.giorni.map((x) => { const t = titoloGiorno(x); return `<button type="button" data-giorno="${x.id}" aria-pressed="${x.id === g.id}"><b>${esc(t.lettera)}</b><span>${esc(t.nome)}</span></button>`; }).join('')}
      </div>
      <div class="plan__info">
        <span>${g.ultimaSeduta ? `Ultima volta ${esc(fa(g.ultimaSeduta))}` : 'Non ancora fatto'}${g.id === giornoConsigliato(s).id ? ' · <b>consigliato oggi</b>' : ''}</span>
        <span id="planProgress">${conPeso ? `${fatti}/${conPeso} pesi segnati oggi` : ''}</span>
      </div>
      <ol class="plan__list">${g.esercizi.map(rigaEsercizio).join('')}</ol>
      ${s.note ? `<p class="plan__note"><b>Note del trainer.</b> ${esc(s.note)}</p>` : ''}
    </div>`;
    collegaScheda();
  }

  function rigaEsercizio(e, i) {
    const rec = e.recupero ? durataRec(e.recupero) : null;
    return `
      <li class="pex ${e.oggi != null ? 'is-done' : ''}" data-es="${e.id}">
        <span class="pex__n" aria-hidden="true">${e.oggi != null ? '✓' : i + 1}</span>
        <div class="pex__main">
          <h3>${esc(e.nome)}</h3>
          <p class="pex__rx"><span><b>${e.serie}</b> serie</span><span><b>${esc(e.ripetizioni)}</b>${/^[\d\s–-]+$/.test(e.ripetizioni) ? ' rip.' : ''}</span>${rec ? `<span>recupero <b>${rec}</b></span>` : ''}</p>
          ${e.note ? `<p class="pex__note">${esc(e.note)}</p>` : ''}
          ${e.recupero ? `<button type="button" class="pex__rest" data-timer aria-label="Avvia il recupero di ${rec} per ${esc(e.nome)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>Avvia recupero <b>${durataRec(e.recupero)}</b></button>` : ''}
        </div>
        ${e.conPeso ? `
        <div class="pex__log">
          <span class="pex__last">${e.ultimo ? `Ultima volta <b>${kg(e.ultimo.peso_kg)} kg</b><br><span class="pex__sep"> · </span>${esc(fa(e.ultimo.data))}` : 'Prima volta'}</span>
          <div class="pex__sets">${(e.oggiSerie || [e.oggi]).map((p, s) => {
            const prima = e.ultimoSerie?.[s] ?? e.ultimo?.peso_kg;
            return `
            <div class="pex__set">
              <span class="pex__set-n">Serie ${s + 1}</span>
              <div class="kg-stepper">
                <button type="button" data-step="-1" aria-label="Diminuisci peso della serie ${s + 1}">−</button>
                <input type="text" inputmode="decimal" autocomplete="off" data-peso="${s}" value="${p != null ? kg(p) : ''}"
                  placeholder="${prima != null ? kg(prima) : '0'}" aria-label="Peso di oggi per ${esc(e.nome)}, serie ${s + 1}, in kg">
                <span class="kg-stepper__unit">kg</span>
                <button type="button" data-step="1" aria-label="Aumenta peso della serie ${s + 1}">+</button>
              </div>
            </div>`;
          }).join('')}</div>
          <div class="pex__foot">
            <span class="pex__state ${e.oggi != null ? 'ok' : ''}" data-stato aria-live="polite">${e.oggi != null ? '✓ Segnato oggi' : ''}</span>
            ${e.ultimo || e.oggi != null ? `<button type="button" class="pex__hist-btn" data-storico aria-expanded="false">Andamento</button>` : ''}
          </div>
        </div>` : '<div class="pex__log pex__log--none">Senza carico</div>'}
        <div class="pex__hist" hidden></div>
      </li>`;
  }

  const timers = new Map();
  // Salvataggi dei pesi in corso, per esercizio. Sta fuori da collegaScheda perché la scheda
  // può essere ridisegnata (cambio giorno) mentre un salvataggio è ancora in viaggio.
  const salvataggi = { inViaggio: new Set(), daRifare: new Map() };
  function collegaScheda() {
    const root = $('planBody');
    root.querySelectorAll('[data-giorno]').forEach((b) => b.addEventListener('click', () => { cliente.giorno = Number(b.dataset.giorno); renderSchedaDiNuovo(); }));

    root.querySelectorAll('.pex[data-es]').forEach((row) => {
      const id = Number(row.dataset.es);
      const e = cliente.scheda.giorni.flatMap((g) => g.esercizi).find((x) => x.id === id);
      const inputs = [...row.querySelectorAll('[data-peso]')];
      const stato = row.querySelector('[data-stato]');
      // Timer di recupero condiviso con l'app (public/app/timer.js)
      row.querySelector('[data-timer]')?.addEventListener('click', async () => {
        const t = await import('/app/timer.js');
        t.avviaRecupero({ secondi: e.recupero, titolo: e.nome });
      });
      row.querySelector('[data-storico]')?.addEventListener('click', (ev) => toggleStorico(row, e, ev.currentTarget));
      if (!inputs.length) return;
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
        stato.className = `pex__state ${e.oggi != null ? 'ok' : ''}`;
        stato.textContent = e.oggi != null ? '✓ Salvato' : 'Peso cancellato';
      };

      // Un solo salvataggio alla volta per esercizio: se ne serve un altro mentre uno è in viaggio,
      // si rifà alla fine con i valori di quel momento (così l'ultimo valore scritto vince sempre).
      async function salva() {
        if (salvataggi.inViaggio.has(id)) { salvataggi.daRifare.set(id, salva); return; }
        const pesi = inputs.map(leggi);
        if (pesi.some((v) => v != null && (!Number.isFinite(v) || v < 0 || v > 1000))) { stato.className = 'pex__state err'; stato.textContent = 'Peso non valido'; return; }
        if (JSON.stringify(pesi) === JSON.stringify(e.oggiSerie)) {
          if (stato.textContent === 'Salvataggio…') esito(); // giro rifatto senza modifiche nuove
          return;
        }
        stato.className = 'pex__state'; stato.textContent = 'Salvataggio…';
        salvataggi.inViaggio.add(id);
        try {
          const r = await put(`/api/app/esercizi/${id}/serie`, { pesi });
          e.oggiSerie = r.pesi;
          e.oggi = r.peso_kg;
          row.classList.toggle('is-done', e.oggi != null);
          row.querySelector('.pex__n').textContent = e.oggi != null ? '✓' : [...row.parentNode.children].indexOf(row) + 1;
          if (!salvataggi.daRifare.has(id)) esito(); // "Salvato" solo se non c'è un altro salvataggio in coda
          if (e.oggi != null && !row.querySelector('[data-storico]')) {
            row.querySelector('.pex__foot').insertAdjacentHTML('beforeend', '<button type="button" class="pex__hist-btn" data-storico aria-expanded="false">Andamento</button>');
            row.querySelector('[data-storico]').addEventListener('click', (ev) => toggleStorico(row, e, ev.currentTarget));
          }
          const hist = row.querySelector('.pex__hist');
          if (!hist.hidden) apriStorico(row, e); // aggiorna il grafico aperto
          const g = cliente.scheda.giorni.find((x) => x.id === cliente.giorno);
          $('planProgress').textContent = `${g.esercizi.filter((x) => x.oggi != null).length}/${g.esercizi.filter((x) => x.conPeso).length} pesi segnati oggi`;
        } catch (ex) {
          stato.className = 'pex__state err'; stato.textContent = ex.message;
        } finally {
          salvataggi.inViaggio.delete(id);
          const rifai = salvataggi.daRifare.get(id);
          salvataggi.daRifare.delete(id);
          rifai?.();
        }
      }
      const presto = (ms) => { clearTimeout(timers.get(id)); timers.set(id, setTimeout(salva, ms)); };
      inputs.forEach((input, i) => {
        input.addEventListener('input', () => { propaga(i); stato.className = 'pex__state'; stato.textContent = ''; presto(1200); });
        input.addEventListener('change', () => { fineModifica(); presto(0); });
        input.addEventListener('blur', fineModifica);
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
        // +/−: passo 2,5 kg (1 kg sotto i 10 kg); se il campo è vuoto parte dal peso suggerito (ultima volta)
        input.closest('.kg-stepper').querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
          const dir = Number(b.dataset.step);
          const suggerito = e.ultimoSerie?.[i] ?? e.ultimo?.peso_kg ?? null;
          const letto = Number.isFinite(leggi(input)) ? leggi(input) : null; // scritta non valida: si riparte dal suggerito
          const base = letto ?? suggerito ?? 0;
          const passo = base < 10 || (base === 10 && dir < 0) ? 1 : 2.5;
          input.value = kg(letto == null && suggerito != null ? base : Math.max(0, Math.round((base + dir * passo) * 100) / 100));
          fineModifica(); // ogni tocco su +/− è una modifica completa
          propaga(i);
          fineModifica();
          stato.className = 'pex__state'; stato.textContent = '';
          presto(900);
        }));
      });
    });
  }
  function renderSchedaDiNuovo() {
    // ricrea il contenitore che renderScheda sostituisce
    $('planBody').outerHTML = '<div></div>';
    renderScheda();
  }

  function toggleStorico(row, e, btn) {
    const hist = row.querySelector('.pex__hist');
    const apri = hist.hidden;
    btn.setAttribute('aria-expanded', String(apri));
    btn.textContent = apri ? 'Chiudi andamento' : 'Andamento';
    if (apri) apriStorico(row, e); else hist.hidden = true;
  }

  async function apriStorico(row, e) {
    const hist = row.querySelector('.pex__hist');
    hist.hidden = false;
    hist.innerHTML = '<p class="empty">Carico lo storico…</p>';
    try {
      const { storico: s } = await api(`/api/app/esercizi/${e.id}/storico`);
      if (!s.length) { hist.innerHTML = '<p class="empty">Nessun peso segnato finora.</p>'; return; }
      const diff = s.at(-1).kg - s[0].kg;
      hist.innerHTML = `
        <div class="pex__chart">${graficoPesi(s, hist.clientWidth - 32)}<div class="pex__tip" hidden></div></div>
        <div class="pex__stats">
          <span>Ultimo <b>${kg(s.at(-1).kg)} kg</b></span>
          <span>Massimo <b>${kg(Math.max(...s.map((x) => x.kg)))} kg</b></span>
          <span>Dall'inizio <b>${diff > 0 ? '+' : ''}${kg(diff)} kg</b></span>
        </div>
        <details class="pex__table"><summary>Vedi tutte le sedute (${s.length})</summary>
          <table><thead><tr><th scope="col">Data</th><th scope="col">Peso</th></tr></thead>
          <tbody>${[...s].reverse().map((x) => `<tr><td>${esc(lunga(x.data))}</td><td>${kg(x.kg)} kg</td></tr>`).join('')}</tbody></table>
        </details>`;
      collegaGrafico(hist, s);
    } catch (ex) {
      hist.innerHTML = `<p class="empty">${esc(ex.message)}</p>`;
    }
  }

  // Una serie (peso nel tempo): linea 2px, punti ≥ 8px, griglia leggera, etichetta solo sull'ultimo valore
  // W = larghezza reale disponibile: il grafico si disegna 1:1, così testo e punti restano leggibili su ogni schermo
  function graficoPesi(s, larghezza) {
    const W = Math.max(260, Math.min(720, Math.round(larghezza))), H = 170, L = 38, R = 40, T = 14, B = 26;
    let lo = Math.min(...s.map((x) => x.kg)), hi = Math.max(...s.map((x) => x.kg));
    if (lo === hi) { lo -= 5; hi += 5; }
    const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi += pad;
    const passo = [1, 2, 2.5, 5, 10, 20, 25, 50].find((p) => (hi - lo) / p <= 4) || 100;
    const y0 = Math.floor(lo / passo) * passo, y1 = Math.ceil(hi / passo) * passo;
    const x = (i) => L + (s.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (s.length - 1));
    const y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const ticks = []; for (let v = y0; v <= y1 + 1e-9; v += passo) ticks.push(v);
    const pts = s.map((p, i) => [x(i), y(p.kg)]);
    const linea = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const maxEtich = Math.max(2, Math.floor((W - L - R) / 56));
    const etich = s.length <= maxEtich ? s.map((_, i) => i) : [0, Math.floor((s.length - 1) / 2), s.length - 1];
    const last = pts.at(-1);
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Andamento del peso: da ${kg(s[0].kg)} a ${kg(s.at(-1).kg)} kg in ${s.length} sedute">
      <g class="pc-grid">${ticks.map((v) => `<line x1="${L}" x2="${W - R + 8}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="pc-axis">${ticks.map((v) => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${kg(v)}</text>`).join('')}
        ${etich.map((i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(breve(s[i].data))}</text>`).join('')}</g>
      <path class="pc-line" d="${linea}"/>
      ${pts.map(([a, b], i) => `<circle class="pc-dot" cx="${a}" cy="${b}" r="4.5" data-i="${i}"/>`).join('')}
      <text class="pc-label" x="${last[0] + 9}" y="${last[1] + 4}">${kg(s.at(-1).kg)}</text>
      ${pts.map(([a], i) => `<rect class="pc-hit" x="${a - 20}" y="0" width="40" height="${H}" data-i="${i}"/>`).join('')}
    </svg>`;
  }
  function collegaGrafico(box, s) {
    const svg = box.querySelector('svg'), tip = box.querySelector('.pex__tip'), dots = box.querySelectorAll('.pc-dot');
    const mostra = (i) => {
      const sc = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
      tip.hidden = false;
      tip.textContent = `${kg(s[i].kg)} kg · ${breve(s[i].data)}`;
      tip.style.left = `${dots[i].cx.baseVal.value * sc}px`;
      tip.style.top = `${dots[i].cy.baseVal.value * sc - 10}px`;
    };
    box.querySelectorAll('.pc-hit').forEach((h) => {
      h.addEventListener('pointerenter', () => mostra(Number(h.dataset.i)));
      h.addEventListener('pointerdown', () => mostra(Number(h.dataset.i)));
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; dots.forEach((d) => d.classList.remove('is-active')); });
  }

  // meglio: 1 = aumentare è positivo, -1 = diminuire è positivo, 0 = neutro
  const METRICHE = [
    ['peso', 'Peso', 'kg', 1, 0], ['grasso', 'Massa grassa', '%', 1, -1], ['muscolo', 'Massa muscolare', 'kg', 1, 1],
    ['acqua', 'Acqua', '%', 1, 1], ['viscerale', 'Grasso viscerale', '', 0, -1], ['etaMetabolica', 'Età metabolica', 'anni', 0, -1],
  ];
  function renderVisita({ ultima: v, precedente: p }) {
    const box = $('visitBox');
    if (!v) { box.outerHTML = ''; return; }
    const tile = ([k, label, unita, dec, meglio]) => {
      if (v.valori[k] == null) return '';
      let delta = '';
      if (p && p.valori[k] != null) {
        const d = Math.round((v.valori[k] - p.valori[k]) * 10 ** dec) / 10 ** dec;
        const cls = d === 0 || meglio === 0 ? '' : (d > 0) === (meglio > 0) ? 'good' : 'bad';
        const testo = d === 0 ? '= invariato' : `${d > 0 ? '▲ +' : '▼ −'}${num(Math.abs(d), dec)}`;
        delta = `<span class="vt__delta ${cls}">${testo}${cls === 'good' ? ' <i>migliorato</i>' : cls === 'bad' ? ' <i>da tenere d\'occhio</i>' : ''}</span>`;
      }
      return `<div class="vt"><small>${label}</small><strong>${num(v.valori[k], dec)}${unita ? ` <em>${unita}</em>` : ''}</strong>${delta}</div>`;
    };
    box.outerHTML = sezione('Ultima visita', `
      <p class="visit__when">Analisi Visbody · ${esc(lunga(v.data))}${v.trainer ? ` · con ${esc(v.trainer)}` : ''}${p ? `<br><span>Confronto con il ${esc(breve(p.data))}</span>` : ''}</p>
      <div class="visit__tiles">${METRICHE.map(tile).join('')}</div>
      ${v.note ? `<p class="visit__note">${esc(v.note)}</p>` : ''}`, `<span class="panel__hint">${esc(fa(v.data))}</span>`);
  }

  /* ---------------- Caricamento ---------------- */
  let primaVolta = true;
  async function carica() {
    const d = await api('/api/area');
    OGGI = d.oggi; ADESSO = d.adesso;
    const u = d.utente;
    const ETICHETTE = { cliente: 'Cliente', receptionist: 'Reception', consulente: 'Consulente commerciale', trainer: 'Personal Trainer', istruttore: 'Istruttore corsi' };
    $('userName').textContent = `${u.nome} ${u.cognome}`;
    $('userRole').textContent = ETICHETTE[u.ruolo];
    $('avatar').textContent = (u.nome[0] + u.cognome[0]).toUpperCase();
    $('today').textContent = lunga(OGGI);
    const ora = toMin(ADESSO);
    $('hello').innerHTML = `${ora < 13 * 60 ? 'Buongiorno' : ora < 18 * 60 ? 'Buon pomeriggio' : 'Buonasera'},<br><span class="grad-text">${esc(u.nome)}.</span>`;
    document.title = `${ETICHETTE[u.ruolo]} · ${u.nome} — Zeta Club`;
    const v = viste[u.ruolo](d);
    $('heroSub').textContent = v.sub;
    $('kpis').innerHTML = v.kpis.join('');
    $('dashBody').innerHTML = v.body;
    if (u.ruolo === 'cliente') caricaClienteExtra();
    // Staff: impegni aggiunti dall'app + collegamento all'app (cambi turno, nuove attività/chiamate, schede)
    if (u.ruolo !== 'cliente') {
      const impegni = (d.impegni || []).map((i) => ({ ...i, tipo: 'impegno', dettaglio: i.note }));
      $('dashBody').insertAdjacentHTML('beforeend', `<div class="dash-grid dash-grid--wide">
        ${sezione('I tuoi impegni', agenda(impegni, "Nessun impegno: aggiungili dall'app."))}
        <div class="dash-side"><a class="promo" href="/app/"><strong>Gestisci i tuoi impegni</strong><span>→</span></a></div>
      </div>`);
    }
    if (anim && primaVolta) {
      gsap.from('.dash-hero__title, .dash-hero__sub', { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' });
      gsap.from('.kpi', { y: 30, opacity: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out', delay: 0.15, clearProps: 'transform,opacity' });
      // clearProps: a fine animazione toglie il transform inline. Con la transition CSS di .ev restava
      // un residuo di ~30px che faceva finire la data del giorno dopo sotto la card precedente.
      gsap.from('.panel, .promo, .ev', { y: 30, opacity: 0, duration: 0.7, stagger: 0.03, ease: 'power3.out', delay: 0.25, clearProps: 'transform,opacity' });
    }
    primaVolta = false;
  }

  $('logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/accedi';
  });

  carica().catch((e) => { $('dashBody').innerHTML = `<p class="empty">${esc(e.message)}</p>`; });
})();
