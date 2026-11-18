/* Codice condiviso da tutte le pagine: smooth scroll, header, menu, reveal */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  window.ZC = { reduce, hasGsap, lenis: null };

  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

  // Se l'utente ha già fatto l'accesso, "Accedi" diventa "La mia area"
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j?.utente) return;
      document.querySelectorAll('[data-login-link]').forEach((a) => { a.href = '/area'; a.textContent = `Ciao ${j.utente.nome}`; });
    })
    .catch(() => {});

  // --- Smooth scroll (Lenis) collegato a GSAP ---
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);
  if (!reduce && typeof window.Lenis !== 'undefined') {
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    window.ZC.lenis = lenis;
    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    // Link interni (#sezione) con scroll morbido
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href*="#"]');
      if (!a) return;
      const url = new URL(a.href);
      if (url.pathname !== location.pathname || !url.hash) return;
      const target = document.querySelector(url.hash);
      if (!target) return;
      e.preventDefault();
      closeMenu();
      lenis.scrollTo(target, { offset: -70, duration: 1.4 });
      history.replaceState(null, '', url.hash);
    });
  }

  // --- Header: diventa solido dopo l'hero, si nasconde scendendo ---
  const header = document.getElementById('header');
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-solid', y > window.innerHeight * 0.6);
    header.classList.toggle('is-hidden', y > lastY && y > window.innerHeight && !document.body.classList.contains('menu-open'));
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- Menu mobile ---
  const burger = document.getElementById('burger');
  function closeMenu() {
    document.body.classList.remove('menu-open');
    burger?.setAttribute('aria-expanded', 'false');
    window.ZC.lenis?.start();
  }
  burger?.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    burger.setAttribute('aria-expanded', String(open));
    open ? window.ZC.lenis?.stop() : window.ZC.lenis?.start();
  });
  document.querySelectorAll('#nav a').forEach((a) => a.addEventListener('click', closeMenu));
  window.ZC.closeMenu = closeMenu;

  // --- Reveal generico per [data-reveal] ---
  window.ZC.initReveals = (root = document) => {
    if (!hasGsap || reduce) return;
    root.querySelectorAll('[data-reveal]:not([data-revealed])').forEach((el) => {
      el.setAttribute('data-revealed', '');
      gsap.fromTo(el, { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
    // Parallax leggero sulle immagini
    root.querySelectorAll('[data-parallax]:not([data-px])').forEach((img) => {
      img.setAttribute('data-px', '');
      gsap.fromTo(img, { yPercent: -8 }, {
        yPercent: 8, ease: 'none',
        scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  };

  window.ZC.loadJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Impossibile caricare ${url}`);
    return r.json();
  };

  /* Carosello: una carta alla volta, con frecce, pallini e contatore "1 / 9".
     Controlli collegati al track tramite [data-carousel-prev|next|dots|count="<id track>"]. */
  window.ZC.carousel = (track) => {
    const id = track.id;
    const q = (k) => document.querySelector(`[data-carousel-${k}="${id}"]`);
    const prev = q('prev'), next = q('next'), dots = q('dots'), count = q('count');
    const cards = () => [...track.children].filter((c) => c.offsetParent !== null);
    const pad = () => parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const current = () => {
      const list = cards();
      let best = 0, dist = Infinity;
      list.forEach((c, i) => { const d = Math.abs(c.offsetLeft - pad() - track.scrollLeft); if (d < dist) { dist = d; best = i; } });
      return best;
    };
    const goTo = (i, smooth = true) => {
      const list = cards();
      const c = list[Math.max(0, Math.min(list.length - 1, i))];
      if (c) track.scrollTo({ left: c.offsetLeft - pad(), behavior: smooth && !reduce ? 'smooth' : 'auto' });
    };
    let lastN = -1;
    const update = () => {
      const n = cards().length, i = current();
      if (prev) prev.disabled = i <= 0;
      if (next) next.disabled = i >= n - 1;
      if (count) count.textContent = n ? `${i + 1} / ${n}` : '';
      if (dots) {
        if (n !== lastN) {
          dots.innerHTML = cards().map((c, k) => `<button type="button" aria-label="Vai a ${k + 1} di ${n}"></button>`).join('');
          lastN = n;
        }
        [...dots.children].forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
        dots.hidden = n <= 1;
      }
    };
    prev?.addEventListener('click', () => goTo(current() - 1));
    next?.addEventListener('click', () => goTo(current() + 1));
    dots?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) goTo([...dots.children].indexOf(b)); });
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.target !== track) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(current() + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(current() - 1); }
    });
    window.addEventListener('resize', () => { goTo(current(), false); update(); });
    update();
    return { update, reset: () => { track.scrollLeft = 0; update(); } };
  };

  window.ZC.escape =(s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();
