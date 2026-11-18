/* Pagina corsi: filtri, carosello, dettaglio, planner settimanale */
(() => {
  const { reduce, hasGsap, escape: esc } = window.ZC;
  const anim = hasGsap && !reduce;
  const LIVELLI = ['', 'Dolce', 'Leggera', 'Media', 'Alta', 'Massima'];
  const GIORNI = [
    { d: 1, s: 'Lun' }, { d: 2, s: 'Mar' }, { d: 3, s: 'Mer' }, { d: 4, s: 'Gio' },
    { d: 5, s: 'Ven' }, { d: 6, s: 'Sab' }, { d: 0, s: 'Dom' },
  ];

  /* Hero */
  if (anim) {
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('[data-split]', { yPercent: 110, duration: 1.4, stagger: 0.12 })
      .from('[data-fade]', { y: 26, opacity: 0, duration: 1, stagger: 0.08 }, 0.3)
      .from('[data-strip]', { y: 120, opacity: 0, duration: 1.4, stagger: 0.08 }, 0.4);
    gsap.utils.toArray('[data-strip]').forEach((img, i) => {
      gsap.to(img, {
        y: (i % 2 ? -60 : -140), ease: 'none',
        scrollTrigger: { trigger: '.page-hero', start: 'top top', end: 'bottom top', scrub: true },
      });
    });
  }

  const grid = document.getElementById('cgrid');
  const filtersEl = document.getElementById('filters');
  let corsiById = {};
  let catName = {};

  Promise.all([ZC.loadJSON('/data/corsi.json'), ZC.loadJSON('/data/planner.json')]).then(([{ categorie, corsi }, planner]) => {
    categorie.forEach((c) => (catName[c.id] = c.nome));
    corsi.forEach((c) => (corsiById[c.id] = c));

    /* Filtri */
    const count = (id) => corsi.filter((c) => c.categoria === id).length;
    filtersEl.innerHTML =
      `<button class="filter" data-f="all" aria-pressed="true">Tutti<sup>${corsi.length}</sup></button>` +
      categorie.map((c) => `<button class="filter" data-f="${esc(c.id)}" aria-pressed="false">${esc(c.nome)}<sup>${count(c.id)}</sup></button>`).join('');

    /* Carosello */
    grid.innerHTML = corsi.map((c) => `
      <button class="course" id="${esc(c.id)}" data-cat="${esc(c.categoria)}" data-id="${esc(c.id)}" aria-label="Dettagli ${esc(c.nome)}">
        <div class="course__img"><img src="${esc(c.img)}" alt="" loading="lazy"><span class="course__cat">${esc(catName[c.categoria])}</span></div>
        <div class="course__body">
          <h3>${esc(c.nome)}</h3>
          <p>${esc(c.breve)}</p>
          <span class="course__more">Scopri il corso <span>→</span></span>
          <div class="course__meta">
            <span>${esc(c.durata)}</span>
            <span class="intensity" title="Intensità ${c.intensita}/5">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= c.intensita ? 'on' : ''}"></i>`).join('')}</span>
          </div>
        </div>
      </button>`).join('');

    const car = ZC.carousel(grid);
    if (anim) {
      ScrollTrigger.batch('.course', {
        start: 'top 92%', once: true,
        onEnter: (els) => gsap.fromTo(els, { y: 60, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.9, ease: 'power3.out' }),
      });
      gsap.set('.course', { opacity: 0 });
    }

    filtersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter');
      if (!btn) return;
      filtersEl.querySelectorAll('.filter').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const f = btn.dataset.f;
      const cards = [...grid.querySelectorAll('.course')];
      const apply = () => {
        cards.forEach((c) => c.classList.toggle('is-hidden', f !== 'all' && c.dataset.cat !== f));
        car.reset();
        if (anim) {
          gsap.fromTo(cards.filter((c) => !c.classList.contains('is-hidden')), { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, duration: 0.6, ease: 'power3.out' });
          ScrollTrigger.refresh();
        }
      };
      anim ? gsap.to(cards, { opacity: 0, y: 10, duration: 0.2, onComplete: apply }) : apply();
    });

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.course');
      if (card) openDrawer(card.dataset.id);
    });

    /* Planner */
    renderPlanner(planner);

    /* Apertura diretta da link /corsi#kombat */
    const fromHash = location.hash.slice(1);
    if (corsiById[fromHash]) setTimeout(() => openDrawer(fromHash), 600);

    ZC.initReveals();
    if (hasGsap) ScrollTrigger.refresh();
  }).catch(() => (grid.innerHTML = '<p>Corsi non disponibili al momento.</p>'));

  /* ---------- Drawer dettaglio ---------- */
  const drawer = document.getElementById('drawer');
  let lastFocus = null;
  const $ = (id) => document.getElementById(id);
  function openDrawer(id) {
    const c = corsiById[id];
    if (!c) return;
    lastFocus = document.activeElement;
    $('drawerImg').src = c.img;
    $('drawerCat').textContent = catName[c.categoria];
    $('drawerTitle').textContent = c.nome;
    $('drawerDesc').textContent = c.descrizione;
    $('drawerDur').textContent = c.durata;
    $('drawerInt').textContent = `${LIVELLI[c.intensita]} · ${c.intensita}/5`;
    $('drawerBen').innerHTML = c.benefici.map((b) => `<li>${esc(b)}</li>`).join('');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    ZC.lenis?.stop();
    drawer.querySelector('.drawer__close').focus();
    history.replaceState(null, '', `#${id}`);
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    ZC.lenis?.start();
    lastFocus?.focus?.({ preventScroll: true });
    history.replaceState(null, '', location.pathname);
  }
  drawer.addEventListener('click', (e) => {
    if (!e.target.closest('[data-close]')) return;
    const goPlanner = e.target.closest('[data-goto-planner]');
    e.preventDefault();
    closeDrawer();
    if (goPlanner) {
      const p = document.getElementById('planner');
      ZC.lenis ? ZC.lenis.scrollTo(p, { offset: -70, duration: 1.4 }) : p.scrollIntoView({ behavior: 'smooth' });
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer(); });

  /* ---------- Planner ---------- */
  function renderPlanner(planner) {
    const daysEl = document.getElementById('days');
    const slotsEl = document.getElementById('slots');
    const oggi = new Date().getDay();

    // Date della settimana corrente (da lunedì)
    const now = new Date();
    const lun = new Date(now);
    lun.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    daysEl.innerHTML = GIORNI.map((g, i) => {
      const dt = new Date(lun); dt.setDate(lun.getDate() + i);
      return `<button class="day" data-d="${g.d}" aria-pressed="${g.d === oggi}"><small>${g.s}${g.d === oggi ? ' · oggi' : ''}</small><strong>${dt.getDate()}</strong></button>`;
    }).join('');

    const show = (d) => {
      const list = planner.settimana[String(d)] || [];
      slotsEl.innerHTML = list.length ? list.map((s) => {
        const c = corsiById[s.corso];
        return `<div class="slot"><div class="slot__time">${esc(s.ora)}</div><div class="slot__name">${esc(c?.nome || s.corso)}<small>${esc(s.sala)} · ${s.durata} min</small></div><span class="slot__tag">${esc(catName[c?.categoria] || '')}</span></div>`;
      }).join('') : '<div class="slot"><div class="slot__name">Nessun corso in programma<small>La sala pesi resta aperta.</small></div></div>';
      if (anim) gsap.from(slotsEl.children, { x: -24, opacity: 0, stagger: 0.05, duration: 0.5, ease: 'power3.out' });
    };
    daysEl.addEventListener('click', (e) => {
      const b = e.target.closest('.day');
      if (!b) return;
      daysEl.querySelectorAll('.day').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      show(Number(b.dataset.d));
    });
    show(oggi);
  }
})();
