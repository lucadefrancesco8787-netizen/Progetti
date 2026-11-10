/* Home page: hero, manifesto, corridoio di luce, corsi orizzontali, sedi, lavora con noi */
(() => {
  const { reduce, hasGsap, escape: esc } = window.ZC;
  const anim = hasGsap && !reduce;
  const desktop = window.matchMedia('(min-width: 901px)');

  /* ---------------- HERO ---------------- */
  if (anim) {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from('.hero__media img', { scale: 1.35, duration: 2.2 })
      .from('.hero__title .line > span', { yPercent: 110, duration: 1.4, stagger: 0.12 }, 0.2)
      .from('[data-hero-fade]', { y: 30, opacity: 0, duration: 1.2, stagger: 0.1 }, 0.6)
      .from('.header', { yPercent: -100, duration: 1, clearProps: 'transform' }, 0.8); // clearProps: un transform rimasto sull'header "intrappolerebbe" il menu mobile

    // Allo scroll l'immagine si "stacca" e si arrotonda, il titolo sale
    gsap.timeline({
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    })
      .to('[data-hero-media]', { clipPath: 'inset(6% 4% 10% 4% round 28px)', ease: 'none' }, 0)
      .to('.hero__media img', { yPercent: 12, ease: 'none' }, 0)
      .to('.hero__content', { yPercent: -18, opacity: 0.2, ease: 'none' }, 0);
    gsap.set('[data-hero-media]', { clipPath: 'inset(0% 0% 0% 0% round 0px)' });
  }

  /* ---------------- MANIFESTO: parole che si accendono ---------------- */
  const words = document.querySelector('[data-words]');
  if (words) {
    words.innerHTML = words.textContent.trim().split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
    if (anim) {
      gsap.to(words.querySelectorAll('.w'), {
        opacity: 1, stagger: 0.08, ease: 'none',
        scrollTrigger: { trigger: words, start: 'top 80%', end: 'bottom 45%', scrub: true },
      });
    } else words.querySelectorAll('.w').forEach((w) => (w.style.opacity = 1));
  }

  /* Contatori */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = parseFloat(el.dataset.count);
    const dec = Number(el.dataset.decimals || 0);
    const fmt = (v) => v.toFixed(dec).replace('.', ',');
    if (!anim) { el.textContent = fmt(end); return; }
    const o = { v: 0 };
    gsap.to(o, {
      v: end, duration: 2, ease: 'power2.out',
      onUpdate: () => (el.textContent = fmt(o.v)),
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  /* ---------------- CORRIDOIO DI LUCE ---------------- */
  const svg = document.getElementById('corridorSvg');
  if (svg) {
    // Cornici annidate a "U" rovesciata che convergono verso il centro, come i LED del nostro ingresso
    const NS = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', '0 0 1000 1000');
    const N = 9;
    const paths = [];
    for (let i = 0; i < N; i++) {
      const t = Math.pow(i / N, 0.85);
      const x1 = 40 + t * 430, x2 = 960 - t * 430;
      const top = 60 + t * 400, bottom = 1000 - t * 360;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${x1},${bottom} L${x1},${top} L${x2},${top} L${x2},${bottom}`);
      p.setAttribute('pathLength', '1');
      p.style.opacity = String(1 - i * 0.07);
      svg.appendChild(p);
      paths.push(p);
    }
    if (anim) {
      paths.forEach((p) => { p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; });
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '.corridor', start: 'top top', end: '+=180%', scrub: 0.8, pin: true, refreshPriority: 2 },
      });
      tl.to(paths, { strokeDashoffset: 0, stagger: 0.08, duration: 0.5, ease: 'none' })
        // autoAlpha (non solo opacity): quando il testo è sparito il pulsante non resta cliccabile "invisibile"
        .from('[data-corridor-text]', { autoAlpha: 0, y: 40, duration: 0.3 }, 0.15)
        .to(svg, { scale: 1.9, transformOrigin: '50% 48%', duration: 0.6, ease: 'power1.in' }, 0.65)
        .to('[data-corridor-text]', { autoAlpha: 0, y: -40, duration: 0.25 }, 0.75)
        .fromTo('[data-corridor-photo]', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4 }, 0.85);
    } else {
      document.querySelector('[data-corridor-photo]').style.opacity = 0;
    }

    /* "Accedi" dal corridoio: si entra negli archi e si arriva al login */
    const cta = document.querySelector('.corridor__cta');
    if (cta && anim) {
      cta.addEventListener('click', (e) => {
        // Ctrl/Cmd/clic centrale: lascia aprire normalmente in un'altra scheda
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        entraNelCorridoio(cta.href);
      });
    }
  }

  function entraNelCorridoio(href) {
    if (document.querySelector('.portal')) return;
    // Intanto il browser inizia a scaricare la pagina di login
    const pre = document.createElement('link');
    pre.rel = 'prefetch'; pre.href = href;
    document.head.appendChild(pre);

    const portal = document.createElement('div');
    portal.className = 'portal';
    const archi = svg.cloneNode(true);
    archi.removeAttribute('id');
    archi.classList.add('portal__svg');
    archi.style.transform = '';
    const flash = document.createElement('div');
    flash.className = 'portal__flash';
    portal.append(archi, flash);
    document.body.appendChild(portal);

    const cornici = archi.querySelectorAll('path');
    const start = gsap.getProperty(svg, 'scale') || 1;
    gsap.set(archi, { scale: start, transformOrigin: '50% 55%' });

    gsap.timeline({
      onComplete: () => {
        try { sessionStorage.setItem('zc-portal', '1'); } catch { /* opzionale */ }
        location.href = href;
      },
    })
      .to(portal, { opacity: 1, duration: 0.25, ease: 'power1.out' })
      .to(cornici, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' }, 0)
      // Le cornici si accendono una dopo l'altra, dalla più vicina alla più lontana
      .to(cornici, { opacity: 1, strokeWidth: 3.2, stagger: 0.04, duration: 0.25 }, 0.1)
      // Il "volo" dentro il corridoio
      .to(archi, { scale: 14, duration: 1.3, ease: 'power3.in' }, 0.2)
      .to(flash, { scale: 1, opacity: 1, duration: 0.55, ease: 'power2.in' }, 1.0);
  }

  // Tornando indietro col browser la pagina può essere ripresa dalla cache: togli il portale
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) document.querySelectorAll('.portal').forEach((p) => p.remove());
  });

  /* ---------------- CORSI (scroll orizzontale) ---------------- */
  const track = document.getElementById('courseTrack');
  const catName = {};
  ZC.loadJSON('/data/corsi.json').then(({ categorie, corsi }) => {
    categorie.forEach((c) => (catName[c.id] = c.nome));
    track.innerHTML = corsi.map((c, i) => `
      <a class="ccard" href="/corsi#${esc(c.id)}">
        <img src="${esc(c.img)}" alt="" loading="lazy">
        <span class="ccard__num">${String(i + 1).padStart(2, '0')}</span>
        <span class="ccard__cat">${esc(catName[c.categoria] || '')}</span>
        <div class="ccard__body"><h3>${esc(c.nome)}</h3><p>${esc(c.breve)}</p></div>
      </a>`).join('') + `
      <a class="ccard ccard--cta" href="/corsi">
        <div><div class="display">Vedi tutti<br>i corsi</div><span class="circle">→</span></div>
      </a>`;
    setupHScroll();
  }).catch(() => (track.innerHTML = '<p style="padding:0 24px">Corsi non disponibili al momento.</p>'));

  function setupHScroll() {
    const section = document.querySelector('.hscroll');
    if (!anim || !desktop.matches) { section.classList.add('no-pin'); ScrollTrigger?.refresh?.(); return; }
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: '.hscroll__pin', scrub: 0.6,
        invalidateOnRefresh: true, refreshPriority: 1,
        onUpdate: (st) => gsap.set('#hProgress', { scaleX: st.progress }),
      },
    });
    // Le card entrano con una leggera rotazione
    gsap.from(track.children, {
      y: 80, rotate: 3, opacity: 0, stagger: 0.06, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: section, start: 'top 70%', once: true },
    });
    ScrollTrigger.refresh();
  }

  /* ---------------- SEDI ---------------- */
  const sediEl = document.getElementById('sediList');
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  function statoApertura(orari) {
    const now = new Date();
    const dow = now.getDay();
    const mins = now.getHours() * 60 + now.getMinutes();
    const oggi = orari.find((o) => o.dow.includes(dow));
    if (oggi && mins >= toMin(oggi.apre) && mins < toMin(oggi.chiude)) {
      return { aperta: true, testo: `Aperto ora · chiude alle ${oggi.chiude === '24:00' ? 'mezzanotte' : oggi.chiude}` };
    }
    return { aperta: false, testo: oggi && mins < toMin(oggi.apre) ? `Chiuso · apre alle ${oggi.apre}` : 'Chiuso ora' };
  }

  ZC.loadJSON('/data/sedi.json').then(({ sedi }) => {
    const dow = new Date().getDay();
    sediEl.innerHTML = sedi.map((s) => {
      const st = statoApertura(s.orari);
      const q = encodeURIComponent(`${s.indirizzo}, ${s.cap} ${s.citta}`);
      return `
      <article class="sede" data-reveal>
        <div class="sede__media">
          <img src="${esc(s.img)}" alt="Ingresso Zeta Club ${esc(s.nome)}" loading="lazy" data-parallax>
          <span class="sede__badge">Sede ${esc(s.nome)}</span>
        </div>
        <div class="sede__body">
          <div>
            <span class="open-now ${st.aperta ? '' : 'closed'}"><i></i>${esc(st.testo)}</span>
            <h3 style="margin-top:14px">${esc(s.nome)}</h3>
            <p class="sede__addr">${esc(s.indirizzo)} · ${esc(s.cap)} ${esc(s.citta)}</p>
          </div>
          <ul class="orari">
            ${s.orari.map((o) => `<li class="${o.dow.includes(dow) ? 'is-today' : ''}"><strong>${esc(o.giorni)}</strong><span>${esc(o.apre)} – ${esc(o.chiude)}</span></li>`).join('')}
          </ul>
          <div class="chips">${s.servizi.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
          <div class="sede__map"><iframe src="${esc(s.mappa)}" title="Mappa ${esc(s.nome)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
          <div class="sede__actions">
            <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${q}" target="_blank" rel="noopener">Indicazioni <span class="arrow">↗</span></a>
            <a class="btn btn--ghost" href="tel:+39${esc(s.telefono.replace(/\s/g, ''))}">${esc(s.telefono)}</a>
          </div>
        </div>
      </article>`;
    }).join('');
    ZC.initReveals(sediEl);
    if (hasGsap) ScrollTrigger.refresh();
  }).catch(() => (sediEl.innerHTML = '<p>Sedi non disponibili al momento.</p>'));

  /* ---------------- LAVORA CON NOI ---------------- */
  const form = document.getElementById('jobForm');
  const roles = document.querySelectorAll('.role');
  const ruolo = document.getElementById('ruolo');
  const roleLabel = document.getElementById('roleLabel');
  roles.forEach((btn) => btn.addEventListener('click', () => {
    roles.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    ruolo.value = btn.dataset.role;
    roleLabel.textContent = btn.querySelector('h3').textContent;
    if (anim) gsap.fromTo(roleLabel, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
  }));

  const drop = document.getElementById('drop');
  const cv = document.getElementById('cv');
  const dropTitle = document.getElementById('dropTitle');
  const dropSub = document.getElementById('dropSub');
  const MAX_MB = 5;
  const showFile = () => {
    const f = cv.files[0];
    drop.classList.toggle('has-file', !!f);
    dropTitle.textContent = f ? f.name : 'Trascina qui il tuo CV o clicca per sceglierlo';
    dropSub.textContent = f ? `${(f.size / 1024 / 1024).toFixed(2)} MB · clicca per cambiarlo` : `PDF, DOC o DOCX · massimo ${MAX_MB} MB`;
  };
  cv.addEventListener('change', showFile);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) { cv.files = e.dataTransfer.files; showFile(); }
  });

  const msg = document.getElementById('jobMsg');
  const submit = document.getElementById('jobSubmit');
  const setMsg = (t, ok = false) => { msg.textContent = t; msg.className = `form__msg ${ok ? 'ok' : 'err'}`; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const f = cv.files[0];
    if (!fd.get('nome')?.trim() || !fd.get('cognome')?.trim()) return setMsg('Inserisci nome e cognome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fd.get('email') || '')) return setMsg('Inserisci un indirizzo email valido.');
    if (!f) return setMsg('Allega il tuo curriculum.');
    if (!/\.(pdf|docx?)$/i.test(f.name)) return setMsg('Il CV deve essere PDF, DOC o DOCX.');
    if (f.size > MAX_MB * 1024 * 1024) return setMsg(`Il CV supera i ${MAX_MB} MB.`);
    if (!fd.get('privacy')) return setMsg('Devi accettare il trattamento dei dati.');

    submit.disabled = true;
    setMsg('Invio in corso…', true);
    try {
      const r = await fetch('/api/candidature', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.errore || 'Invio non riuscito, riprova.');
      form.classList.add('is-sent');
      if (anim) gsap.from('.form__success', { y: 30, opacity: 0, duration: 0.8, ease: 'power3.out' });
    } catch (err) {
      setMsg(err.message);
    } finally {
      submit.disabled = false;
    }
  });

  /* ---------------- Reveal + refresh finale ---------------- */
  ZC.initReveals();
  window.addEventListener('load', () => hasGsap && ScrollTrigger.refresh());
})();
