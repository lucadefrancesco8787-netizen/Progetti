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
        body: `<div class="dash-grid dash-grid--wide">
          ${sezione('I tuoi appuntamenti', agenda(d.appuntamenti, 'Non hai appuntamenti in programma.'))}
          <div class="dash-side">
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
    if (anim && primaVolta) {
      gsap.from('.dash-hero__title, .dash-hero__sub', { y: 30, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out' });
      gsap.from('.kpi', { y: 30, opacity: 0, duration: 0.8, stagger: 0.06, ease: 'power3.out', delay: 0.15 });
      gsap.from('.panel, .promo, .ev', { y: 30, opacity: 0, duration: 0.7, stagger: 0.03, ease: 'power3.out', delay: 0.25 });
    }
    primaVolta = false;
  }

  $('logout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/accedi';
  });

  carica().catch((e) => { $('dashBody').innerHTML = `<p class="empty">${esc(e.message)}</p>`; });
})();
