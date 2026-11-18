/* Allenamento guidato: un esercizio alla volta, "Completato" o "Salta".
   Usato dall'app (public/app/app.js) e dall'area riservata (public/js/area.js).
   Lo stato della seduta di oggi resta sul dispositivo (localStorage): i pesi invece
   vengono salvati sul server come sempre, mentre li scrivi. */

const chiave = ({ utente, oggi, giorno }) => `zc-allenamento:${utente}:${oggi}:${giorno}`;

function leggi(k) {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    if (v && Array.isArray(v.fatti) && Array.isArray(v.saltati)) return v;
  } catch {}
  return { fatti: [], saltati: [] };
}
function scrivi(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

/** Crea la seduta per un giorno della scheda. esercizi = [{ id, ... }] nell'ordine della scheda. */
export function seduta({ utente, oggi, giorno, esercizi }) {
  const k = chiave({ utente, oggi, giorno });
  let s = leggi(k);
  const ids = esercizi.map((e) => e.id);
  // esercizi tolti dalla scheda nel frattempo: non contano più
  s.fatti = s.fatti.filter((id) => ids.includes(id));
  s.saltati = s.saltati.filter((id) => ids.includes(id));

  const statoDi = (id) => (s.fatti.includes(id) ? 'fatto' : s.saltati.includes(id) ? 'saltato' : null);
  const corrente = () => esercizi.findIndex((e) => !statoDi(e.id)); // -1 = finito
  const segna = (id, tipo) => {
    s.fatti = s.fatti.filter((x) => x !== id);
    s.saltati = s.saltati.filter((x) => x !== id);
    if (tipo === 'fatto') s.fatti.push(id);
    if (tipo === 'saltato') s.saltati.push(id);
    scrivi(k, s);
  };

  return {
    statoDi,
    corrente,
    completa: (id) => segna(id, 'fatto'),
    salta: (id) => segna(id, 'saltato'),
    /** Rimette in coda un esercizio (es. per rifare uno saltato). */
    riapri: (id) => segna(id, null),
    ricomincia: () => { s = { fatti: [], saltati: [] }; scrivi(k, s); },
    conteggi: () => ({ fatti: s.fatti.length, saltati: s.saltati.length, totale: esercizi.length }),
    iniziata: () => s.fatti.length + s.saltati.length > 0,
  };
}
