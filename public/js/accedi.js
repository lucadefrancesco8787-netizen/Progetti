/* Pagina di accesso */
(() => {
  const $ = (id) => document.getElementById(id);
  const TESTI = {
    cliente: ['Accedi alla tua area', 'Controlla i tuoi appuntamenti: Visbody, visite mediche, consulenze e personal training.'],
    staff: ['Accesso staff', 'Turni, agenda, chiamate e lezioni assegnate: tutto il tuo lavoro in un posto solo.'],
  };
  const tabs = document.querySelectorAll('[role="tab"]');
  const setTab = (t) => {
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    [$('authTitle').textContent, $('authSub').textContent] = TESTI[t];
  };
  tabs.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  $('pwToggle').addEventListener('click', () => {
    const pw = $('password');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('pwToggle').textContent = show ? 'Nascondi' : 'Mostra';
    $('pwToggle').setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
  });

  $('demoList').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setTab(b.dataset.tab);
    $('email').value = b.dataset.email;
    $('password').value = b.dataset.pw;
    $('loginBtn').focus();
  });

  const msg = $('loginMsg');
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    const password = $('password').value;
    msg.className = 'form__msg err';
    if (!email || !password) { msg.textContent = 'Inserisci email e password.'; return; }
    $('loginBtn').disabled = true;
    msg.textContent = '';
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.errore || 'Accesso non riuscito.');
      msg.className = 'form__msg ok';
      msg.textContent = `Ciao ${j.utente.nome}, ti porto nella tua area…`;
      location.href = '/area';
    } catch (err) {
      msg.textContent = err.message;
      if (window.gsap) gsap.fromTo('.auth__box', { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
    } finally {
      $('loginBtn').disabled = false;
    }
  });

  if (window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.from('.auth__visual img', { scale: 1.2, duration: 2, ease: 'expo.out' });
    gsap.from('.auth__claim > *', { y: 40, opacity: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out', delay: 0.2 });
    gsap.from('.auth__box > *', { y: 24, opacity: 0, duration: 0.9, stagger: 0.06, ease: 'power3.out', delay: 0.1 });
  }
})();
