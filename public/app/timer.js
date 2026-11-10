/*
 * Timer di recupero tra le serie (usato dall'app e dall'area cliente del sito).
 * - Il tempo si basa sull'orario di fine, non su un contatore: resta giusto anche se il telefono va in standby.
 * - Un solo timer alla volta; sopravvive al ricaricamento della pagina (localStorage, se disponibile).
 * - A fine recupero: suono (Web Audio), vibrazione dove supportata, messaggio.
 * - Durante il recupero chiede di tenere lo schermo acceso (Wake Lock, dove supportato).
 */
const CHIAVE = 'zc-timer-recupero';
const PASSO = 15;
let el, stato = null, tick = null, audio = null, wakeLock = null, chiudiDopo = null, opzioni = { bottom: '16px' };

const salva = () => { try { stato ? localStorage.setItem(CHIAVE, JSON.stringify(stato)) : localStorage.removeItem(CHIAVE); } catch {} };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const residuo = () => (stato.pausaResiduo != null ? stato.pausaResiduo : (stato.fine - Date.now()) / 1000);

function crea() {
  if (el) return;
  const css = document.createElement('style');
  css.textContent = `
  .rt { position: fixed; left: 12px; right: 12px; z-index: 45; max-width: 520px; margin-inline: auto;
    padding: 14px 16px 16px; border-radius: 22px; background: #151817; color: #fff; font-family: inherit;
    box-shadow: 0 18px 50px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.08);
    transform: translateY(140%); transition: transform .35s cubic-bezier(.2,.7,.1,1); }
  .rt.is-on { transform: none; }
  .rt__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .rt__label { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #3fc26b; }
  .rt__title { margin: 2px 0 0; font-size: 15px; font-weight: 700; color: rgba(255,255,255,.85); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 62vw; }
  .rt__close { flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%; background: #1d2120; color: #fff; font-size: 18px; cursor: pointer; }
  .rt__main { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
  .rt__time { font-family: "Archivo", system-ui, sans-serif; font-weight: 800; font-size: 48px; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
  .rt__btns { display: flex; gap: 8px; }
  .rt__btns button { min-width: 52px; height: 48px; padding: 0 10px; border: 0; border-radius: 14px; background: #1d2120; color: #fff; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; }
  .rt__btns button:active, .rt__close:active { transform: scale(.96); }
  .rt__bar { height: 6px; margin-top: 12px; border-radius: 3px; background: rgba(255,255,255,.1); overflow: hidden; }
  .rt__bar i { display: block; height: 100%; width: 100%; border-radius: 3px; background: linear-gradient(90deg, #14b3ac, #3fc26b, #d6e33b); transform-origin: left; }
  .rt.is-paused .rt__time { opacity: .55; }
  .rt.is-done { background: linear-gradient(135deg, #14b3ac, #3fc26b 55%, #d6e33b); color: #0b0c0c; animation: rtPulse .9s ease-in-out 3; }
  .rt.is-done .rt__label, .rt.is-done .rt__title { color: #0b0c0c; }
  .rt.is-done .rt__btns button, .rt.is-done .rt__close { background: rgba(11,12,12,.14); color: #0b0c0c; }
  .rt.is-done .rt__bar { visibility: hidden; }
  @keyframes rtPulse { 50% { transform: scale(1.02); } }
  @media (prefers-reduced-motion: reduce) { .rt { transition: none; } .rt.is-done { animation: none; } }`;
  document.head.append(css);
  el = document.createElement('section');
  el.className = 'rt';
  el.setAttribute('aria-label', 'Timer di recupero');
  el.hidden = true;
  el.innerHTML = `
    <div class="rt__top">
      <div><div class="rt__label" data-label>Recupero</div><p class="rt__title" data-title></p></div>
      <button type="button" class="rt__close" data-stop aria-label="Chiudi timer">✕</button>
    </div>
    <div class="rt__main">
      <div class="rt__time" role="timer" aria-live="off" data-time>0:00</div>
      <div class="rt__btns">
        <button type="button" data-meno aria-label="Togli 15 secondi">−15</button>
        <button type="button" data-pausa aria-label="Metti in pausa">❚❚</button>
        <button type="button" data-piu aria-label="Aggiungi 15 secondi">+15</button>
      </div>
    </div>
    <div class="rt__bar" aria-hidden="true"><i data-bar></i></div>
    <p class="sr-only" aria-live="assertive" data-annuncio style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></p>`;
  document.body.append(el);
  el.querySelector('[data-stop]').addEventListener('click', ferma);
  el.querySelector('[data-piu]').addEventListener('click', () => sposta(PASSO));
  el.querySelector('[data-meno]').addEventListener('click', () => sposta(-PASSO));
  el.querySelector('[data-pausa]').addEventListener('click', pausa);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !stato) return;
    aggiorna();
    if (!stato?.finito && stato?.pausaResiduo == null) tieniSchermoAcceso();
  });
}

/* ---------- Suono e vibrazione ---------- */
// L'audio va "sbloccato" con un tocco dell'utente (requisito di iPhone): lo facciamo all'avvio del timer
function sbloccaAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
function suona() {
  try { navigator.vibrate?.([250, 120, 250, 120, 400]); } catch {}
  if (!audio) return;
  const t0 = audio.currentTime;
  [0, 0.28, 0.56].forEach((d, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t0 + d);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (i === 2 ? 0.45 : 0.2));
    o.connect(g).connect(audio.destination);
    o.start(t0 + d);
    o.stop(t0 + d + 0.5);
  });
}

async function tieniSchermoAcceso() {
  try { if (!wakeLock || wakeLock.released) wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function liberaSchermo() { try { wakeLock?.release(); } catch {} wakeLock = null; }

/* ---------- Ciclo ---------- */
function aggiorna() {
  if (!stato) return;
  const r = residuo();
  if (r <= 0 && !stato.finito) return fine();
  if (stato.finito) return;
  el.querySelector('[data-time]').textContent = mmss(r);
  el.querySelector('[data-bar]').style.transform = `scaleX(${Math.max(0, Math.min(1, r / stato.totale))})`;
}

function fine() {
  clearInterval(tick);
  stato.finito = true;
  salva();
  liberaSchermo();
  el.classList.add('is-done');
  el.classList.remove('is-paused');
  el.querySelector('[data-label]').textContent = 'Recupero finito';
  el.querySelector('[data-time]').textContent = 'Vai!';
  el.querySelector('[data-annuncio]').textContent = `Recupero finito: ${stato.titolo}. Inizia la prossima serie.`;
  el.querySelector('.rt__btns').hidden = true;
  // Se è scaduto mentre l'app era chiusa da molto, niente suono "in ritardo"
  if (Date.now() - stato.fine < 15000) suona();
  clearTimeout(chiudiDopo);
  chiudiDopo = setTimeout(ferma, 12000);
}

function mostra() {
  el.hidden = false;
  el.style.bottom = opzioni.bottom;
  el.classList.remove('is-done');
  el.classList.toggle('is-paused', stato.pausaResiduo != null);
  el.querySelector('.rt__btns').hidden = false;
  el.querySelector('[data-label]').textContent = 'Recupero';
  el.querySelector('[data-title]').textContent = stato.titolo;
  aggiornaPausa();
  requestAnimationFrame(() => el.classList.add('is-on'));
  clearInterval(tick);
  tick = setInterval(aggiorna, 250);
  aggiorna();
}

function aggiornaPausa() {
  const b = el.querySelector('[data-pausa]');
  const inPausa = stato?.pausaResiduo != null;
  b.textContent = inPausa ? '▶' : '❚❚';
  b.setAttribute('aria-label', inPausa ? 'Riprendi' : 'Metti in pausa');
  el.classList.toggle('is-paused', inPausa);
}

/* ---------- API ---------- */
export function configura(o) { Object.assign(opzioni, o); }

export function avviaRecupero({ secondi, titolo }) {
  crea();
  sbloccaAudio();
  clearTimeout(chiudiDopo);
  stato = { fine: Date.now() + secondi * 1000, totale: secondi, titolo, pausaResiduo: null, finito: false };
  salva();
  tieniSchermoAcceso();
  mostra();
}

export function ferma() {
  clearInterval(tick);
  clearTimeout(chiudiDopo);
  liberaSchermo();
  stato = null;
  salva();
  if (!el) return;
  el.classList.remove('is-on');
  setTimeout(() => { if (!stato) el.hidden = true; }, 380);
}

function sposta(delta) {
  if (!stato || stato.finito) return;
  if (stato.pausaResiduo != null) stato.pausaResiduo = Math.max(1, stato.pausaResiduo + delta);
  else stato.fine = Math.max(Date.now() + 1000, stato.fine + delta * 1000);
  stato.totale = Math.max(stato.totale, residuo());
  salva();
  aggiorna();
}

function pausa() {
  if (!stato || stato.finito) return;
  if (stato.pausaResiduo == null) { stato.pausaResiduo = residuo(); liberaSchermo(); }
  else { stato.fine = Date.now() + stato.pausaResiduo * 1000; stato.pausaResiduo = null; tieniSchermoAcceso(); }
  salva();
  aggiornaPausa();
  aggiorna();
}

// Riprende un timer rimasto aperto (es. pagina ricaricata durante il recupero)
export function ripristina() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch {}
  if (!s || s.finito || (s.pausaResiduo == null && s.fine < Date.now() - 60000)) { try { localStorage.removeItem(CHIAVE); } catch {} return; }
  crea();
  stato = s;
  mostra();
}

export const durata = mmss;
