/* Pagina Visbody: animazioni + prenotazione in 3 passaggi */
(() => {
  const { reduce, hasGsap, escape: esc } = window.ZC;
  const anim = hasGsap && !reduce;
  const $ = (id) => document.getElementById(id);
  const GIORNI = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const OBIETTIVI = { dimagrimento: 'Dimagrire', massa: 'Aumentare la massa', tonificazione: 'Tonificare', performance: 'Performance', benessere: 'Stare bene' };

  // Le date arrivano come "YYYY-MM-DD": le gestisco in UTC per evitare sfasamenti di fuso
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dataLunga = (s) => { const d = parse(s); return `${GIORNI_LUNGHI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`; };

  /* ---------------- Animazioni ---------------- */
  if (anim) {
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('[data-split]', { yPercent: 110, duration: 1.4, stagger: 0.12 })
      .from('[data-fade]', { y: 26, opacity: 0, duration: 1, stagger: 0.08 }, 0.3)
      .from('.scan__svg', { opacity: 0, scale: 0.9, duration: 1.6 }, 0.2)
      .from('.scan__chip', { opacity: 0, x: (i) => (i % 2 ? 30 : -30), duration: 1, stagger: 0.15 }, 0.8);

    // Linea dei passaggi che si riempie con lo scroll
    const vertical = window.matchMedia('(max-width: 800px)').matches;
    gsap.fromTo('#stepsLine', { [vertical ? 'scaleY' : 'scaleX']: 0 }, {
      [vertical ? 'scaleY' : 'scaleX']: 1, ease: 'none',
      scrollTrigger: {
        trigger: '#steps', start: 'top 75%', end: 'bottom 55%', scrub: true,
        onUpdate: (st) => document.querySelectorAll('.step').forEach((s, i, all) => s.classList.toggle('is-on', st.progress >= i / all.length)),
      },
    });
    gsap.from('.step', { y: 40, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: '#steps', start: 'top 80%', once: true } });
  } else document.querySelectorAll('.step').forEach((s) => s.classList.add('is-on'));
  ZC.initReveals();

  /* ---------------- Stato della prenotazione ---------------- */
  const state = { trainer: null, data: null, ora: null, durata: 30 };
  let trainers = [];

  const api = async (url, opts) => {
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) { const e = new Error(j.errore || 'Errore di connessione, riprova.'); e.status = r.status; throw e; }
    return j;
  };

  /* Navigazione tra i passaggi */
  const steps = document.querySelectorAll('.wstep');
  const stepperItems = document.querySelectorAll('#stepper li');
  function go(n) {
    steps.forEach((s) => { const on = Number(s.dataset.step) === n; s.hidden = !on; s.classList.toggle('is-active', on); });
    stepperItems.forEach((li, i) => { li.classList.toggle('is-active', i + 1 === n); li.classList.toggle('is-done', i + 1 < n); });
    const current = document.querySelector(`.wstep[data-step="${n}"]`);
    if (anim) gsap.fromTo(current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    const top = $('prenota');
    if (top.getBoundingClientRect().top < -40) ZC.lenis ? ZC.lenis.scrollTo(top, { offset: -60, duration: 1 }) : top.scrollIntoView({ behavior: 'smooth' });
    ScrollTrigger?.refresh?.();
  }
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.closest('.wstep').dataset.step);
    go(n - 1);
  }));

  /* ---------------- STEP 1: trainer ---------------- */
  api('/api/visbody/trainer').then((res) => {
    trainers = res.trainer;
    state.durata = res.durataVisitaMin;
    const ordine = [1, 2, 3, 4, 5, 6, 0];
    $('trainers').innerHTML = trainers.map((t) => `
      <button type="button" class="tcard" role="radio" aria-checked="false" data-id="${esc(t.id)}">
        <div class="tcard__img"><img src="${esc(t.foto)}" alt="${esc(t.nome)} ${esc(t.cognome)}" loading="lazy"><span class="tcard__role">${esc(t.ruolo)}</span></div>
        <div class="tcard__body">
          <h3>${esc(t.nome)} ${esc(t.cognome)}</h3>
          <p>${esc(t.bio)}</p>
          <div class="chips">${t.specialita.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
          <div class="tcard__days" title="Giorni in cui è disponibile">${ordine.map((d) => `<i class="${t.giorniLavoro.includes(d) ? 'on' : ''}">${GIORNI[d][0]}</i>`).join('')}</div>
          <div class="tcard__cta"><span>Scegli ${esc(t.nome)}</span><span>→</span></div>
        </div>
      </button>`).join('');
    if (anim) gsap.from('.tcard', { y: 50, opacity: 0, stagger: 0.07, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: '#trainers', start: 'top 85%', once: true } });
  }).catch((e) => ($('trainers').innerHTML = `<p class="times__empty">${esc(e.message)}</p>`));

  $('trainers').addEventListener('click', (e) => {
    const card = e.target.closest('.tcard');
    if (!card) return;
    state.trainer = trainers.find((t) => t.id === card.dataset.id);
    state.data = state.ora = null;
    $('pickedTrainer').innerHTML = `<img src="${esc(state.trainer.foto)}" alt=""><div><strong>${esc(state.trainer.nome)} ${esc(state.trainer.cognome)}</strong><small>${esc(state.trainer.ruolo)}</small></div>`;
    loadCalendar();
    go(2);
  });

  /* ---------------- STEP 2: giorno e ora ---------------- */
  async function loadCalendar() {
    const cal = $('cal');
    cal.innerHTML = '<p class="times__empty">Carico le disponibilità…</p>';
    $('times').innerHTML = '<p class="times__empty">Seleziona prima un giorno.</p>';
    try {
      const { giorni } = await api(`/api/visbody/trainer/${encodeURIComponent(state.trainer.id)}/calendario`);
      let mese = -1;
      cal.innerHTML = giorni.map((g) => {
        const d = parse(g.data);
        const sep = d.getUTCMonth() !== mese ? `<span class="cmonth">${MESI[d.getUTCMonth()].slice(0, 3)}</span>` : '';
        mese = d.getUTCMonth();
        const label = g.totali === 0 ? 'riposo' : g.liberi === 0 ? 'completo' : `${g.liberi} liberi`;
        return `${sep}<button type="button" class="cday" role="radio" aria-checked="false" data-data="${g.data}" ${g.liberi ? '' : 'disabled'} aria-label="${dataLunga(g.data)}, ${label}">
          <small>${GIORNI[d.getUTCDay()]}</small><strong>${d.getUTCDate()}</strong><em>${label}</em></button>`;
      }).join('');
      const first = cal.querySelector('.cday:not(:disabled)');
      if (first) selectDay(first);
      else $('times').innerHTML = '<p class="times__empty">Nessuna disponibilità nelle prossime settimane. Prova con un altro trainer.</p>';
    } catch (e) {
      cal.innerHTML = `<p class="times__empty">${esc(e.message)}</p>`;
    }
  }

  $('cal').addEventListener('click', (e) => { const b = e.target.closest('.cday'); if (b && !b.disabled) selectDay(b); });

  async function selectDay(btn) {
    $('cal').querySelectorAll('.cday').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    state.data = btn.dataset.data;
    state.ora = null;
    $('slotLabel').textContent = `Orari disponibili · ${dataLunga(state.data)}`;
    const times = $('times');
    times.innerHTML = '<p class="times__empty">Carico gli orari…</p>';
    try {
      const { slot } = await api(`/api/visbody/trainer/${encodeURIComponent(state.trainer.id)}/slot?data=${state.data}`);
      if (btn.dataset.data !== state.data) return; // l'utente ha già cambiato giorno
      times.innerHTML = slot.length
        ? slot.map((s) => `<button type="button" class="time" role="radio" aria-checked="false" data-ora="${s.ora}" ${s.libero ? '' : 'disabled'} aria-label="${s.ora}${s.libero ? '' : ', occupato'}">${s.ora}</button>`).join('')
        : '<p class="times__empty">Nessun orario in questo giorno.</p>';
      if (anim) gsap.from(times.children, { y: 14, opacity: 0, stagger: 0.025, duration: 0.4, ease: 'power2.out' });
    } catch (e) {
      times.innerHTML = `<p class="times__empty">${esc(e.message)}</p>`;
    }
  }

  $('times').addEventListener('click', (e) => {
    const b = e.target.closest('.time');
    if (!b || b.disabled) return;
    $('times').querySelectorAll('.time').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    state.ora = b.dataset.ora;
    renderSummary();
    setTimeout(() => go(3), 250);
  });

  /* ---------------- STEP 3: dati ---------------- */
  function oraFine() {
    const [h, m] = state.ora.split(':').map(Number);
    const t = h * 60 + m + state.durata;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  function renderSummary() {
    const t = state.trainer;
    $('summary').innerHTML = `
      <div class="summary__img"><img src="${esc(t.foto)}" alt=""></div>
      <div class="summary__body">
        <h4>La tua visita</h4>
        <dl>
          <div><dt>Trainer</dt><dd>${esc(t.nome)} ${esc(t.cognome)}</dd></div>
          <div><dt>Giorno</dt><dd>${esc(dataLunga(state.data))}</dd></div>
          <div><dt>Orario</dt><dd>${esc(state.ora)} – ${esc(oraFine())}</dd></div>
          <div><dt>Dove</dt><dd>Via Gianturco 27</dd></div>
        </dl>
        <span class="summary__free">Analisi Visbody + consulenza</span>
      </div>`;
  }

  const form = $('bookForm');
  const msg = $('bookMsg');
  const setMsg = (t, ok = false) => { msg.textContent = t; msg.className = `form__msg ${ok ? 'ok' : 'err'}`; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      trainer: state.trainer?.id, data: state.data, ora: state.ora,
      nome: fd.get('nome')?.trim(), cognome: fd.get('cognome')?.trim(),
      email: fd.get('email')?.trim(), telefono: fd.get('telefono')?.trim(),
      iscritto: fd.get('iscritto'), obiettivo: fd.get('obiettivo') || '', note: fd.get('note') || '',
      privacy: fd.get('privacy') === 'on',
    };
    if (!body.nome || !body.cognome) return setMsg('Inserisci nome e cognome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email || '')) return setMsg('Inserisci un indirizzo email valido.');
    if ((body.telefono || '').replace(/\D/g, '').length < 8) return setMsg('Inserisci un numero di telefono valido.');
    if (!body.privacy) return setMsg('Devi accettare il trattamento dei dati.');

    const btn = $('bookSubmit');
    btn.disabled = true;
    setMsg('Confermo la prenotazione…', true);
    try {
      const { prenotazione } = await api('/api/visbody/prenotazioni', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      setMsg('');
      showDone(prenotazione, body);
    } catch (err) {
      setMsg(err.message);
      if (err.status === 409) { // slot preso nel frattempo: torno alla scelta dell'orario
        setTimeout(() => { go(2); const day = $('cal').querySelector(`[data-data="${state.data}"]`); if (day) selectDay(day); }, 1400);
      }
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Conferma ---------------- */
  function showDone(p, dati) {
    $('done').innerHTML = `
      <div class="done__check"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div>
      <h3>Ci vediamo ${esc(dataLunga(p.data).split(' ')[0])}!</h3>
      <p>La tua visita Visbody è confermata. Conserva il codice: ti servirà per annullare o spostare l'appuntamento.</p>
      <div class="ticket">
        <img src="${esc(p.trainer.foto)}" alt="">
        <div><strong>${esc(p.trainer.nome)} ${esc(p.trainer.cognome)}</strong><span>${esc(dataLunga(p.data))} · ore ${esc(p.ora)}</span>${dati.obiettivo ? `<br><span>Obiettivo: ${esc(OBIETTIVI[dati.obiettivo])}</span>` : ''}</div>
        <div class="ticket__code"><span>Codice prenotazione</span><b>${esc(p.codice)}</b></div>
      </div>
      <div class="done__actions">
        <button class="btn" type="button" id="icsBtn">Aggiungi al calendario <span class="arrow">↓</span></button>
        <button class="btn btn--ghost" type="button" id="againBtn">Nuova prenotazione</button>
      </div>`;
    go(4);
    stepperItems.forEach((li) => { li.classList.remove('is-active'); li.classList.add('is-done'); });
    $('icsBtn').addEventListener('click', () => downloadIcs(p));
    $('againBtn').addEventListener('click', () => { form.reset(); state.trainer = state.data = state.ora = null; go(1); });
  }

  // File .ics compatibile con Google Calendar, Apple Calendar e Outlook
  function downloadIcs(p) {
    const [y, m, d] = p.data.split('-');
    const [hh, mm] = p.ora.split(':');
    const start = `${y}${m}${d}T${hh}${mm}00`;
    const endMin = Number(hh) * 60 + Number(mm) + p.durataMin;
    const end = `${y}${m}${d}T${String(Math.floor(endMin / 60)).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zeta Club//Visbody//IT', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${p.codice}@zetaclub`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/Rome:${start}`, `DTEND;TZID=Europe/Rome:${end}`,
      `SUMMARY:Visbody con ${p.trainer.nome} – Zeta Club`,
      'LOCATION:Zeta Club\\, Via Emanuele Gianturco 27\\, 80046 San Giorgio a Cremano (NA)',
      `DESCRIPTION:Codice prenotazione ${p.codice}. Arriva a digiuno da 2-3 ore e con abiti leggeri.`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Visbody tra 2 ore', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `visbody-${p.codice}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------------- Annullamento ---------------- */
  $('cancelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const out = $('cancelMsg');
    try {
      await api('/api/visbody/prenotazioni/annulla', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codice: fd.get('codice'), email: fd.get('email') }),
      });
      out.textContent = 'Prenotazione annullata. Lo slot è di nuovo disponibile.';
      out.className = 'form__msg ok';
      e.target.reset();
      if (state.trainer) loadCalendar();
    } catch (err) {
      out.textContent = err.message;
      out.className = 'form__msg err';
    }
  });
})();
