# Zeta Club — sito web

Sito della palestra **Zeta Club – gym culture** (San Giorgio a Cremano).

- Home con scroll interattivo, sezione sedi e "Lavora con noi" con invio dei curriculum
- Pagina **/corsi** con filtri, schede di dettaglio e planner settimanale

## Avvio in locale

Requisiti: **Node.js 22.13 o successivo**.

```bash
npm install
cp .env.example .env      # su Windows: copy .env.example .env
npm run dev               # riavvio automatico a ogni modifica
```

Apri http://localhost:3000

## Struttura

```
public/            sito (HTML, CSS, JS, immagini)
  data/            contenuti modificabili: corsi.json, sedi.json, planner.json
server/            server Node/Express
  migrations/      struttura del database (file .sql applicati in ordine)
data/              creata in automatico: database e CV caricati (non va su git)
```

### Modificare i contenuti
- **Nuova sede**: aggiungi un oggetto in `public/data/sedi.json`.
- **Nuovo corso**: aggiungi un oggetto in `public/data/corsi.json`.
- **Orari dei corsi**: `public/data/planner.json`. Gli orari attuali sono **di esempio**.

### Prenotazioni Visbody (/visbody)
- I trainer, i loro turni, la durata della visita (30 min) e quanti giorni in anticipo si può prenotare sono in `server/data/trainer.json`. **I trainer attuali sono di esempio.**
- Il server controlla che l'orario rientri nel turno del trainer e non sia già preso (indice univoco nel database), quindi due persone non possono prenotare lo stesso slot.
- Il cliente riceve un codice (es. `VB-7K2M9Q`), con cui può annullare la visita dalla pagina usando anche la sua email.
- Agenda per lo staff: `GET /api/visbody/prenotazioni?token=<ADMIN_TOKEN>` (dalla data di oggi; `&da=YYYY-MM-DD` per cambiare data).

### Area riservata (/accedi → /area)
Un unico login per clienti e staff: il ruolo dell'utente decide cosa vede.

| Ruolo | Cosa vede |
|---|---|
| Cliente | Appuntamenti (Visbody, visita medica, consulenze, personal) e storico |
| Reception | Turni delle prossime 2 settimane, attività in sospeso (spuntabili) |
| Consulente | Chiamate da fare con esito, consulenze in agenda |
| Personal trainer | Turni in sala, sessioni di personal, Visbody prenotati con lui |
| Istruttore | Lezioni assegnate, con i colleghi in co-conduzione e lo staff di ogni corso |

- Password salvate con **scrypt**, sessione in cookie `HttpOnly` + `SameSite=Lax` (metti `COOKIE_SECURE=true` in HTTPS), limite ai tentativi di accesso.
- Con `SEED_DEMO=true` al primo avvio vengono creati 5 account di prova e dati di esempio con date relative a oggi.
  `npm run seed` li elenca, `npm run seed:reset` li ricrea (cancella solo i dati marcati demo).
- **In produzione**: `SEED_DEMO=false`, poi crea gli utenti reali (serve ancora una pagina di amministrazione).

| Ruolo | Email | Password |
|---|---|---|
| Cliente | cliente@demo.it | Cliente2026! |
| Reception | reception@demo.it | Reception2026! |
| Consulente | consulente@demo.it | Consulente2026! |
| Personal trainer | trainer@demo.it | Trainer2026! |
| Istruttore | istruttore@demo.it | Istruttore2026! |

### Candidature
I CV vengono salvati in `UPLOAD_DIR`, e i dati del candidato nel database SQLite (tabella `candidature`).
Per vedere l'elenco: `GET /api/candidature?token=<ADMIN_TOKEN>`.

## Pubblicare su un server

1. Copia il progetto (o fai `git clone`) sul server.
2. `npm ci --omit=dev`
3. Imposta le variabili d'ambiente (vedi `.env.example`), in particolare `ADMIN_TOKEN`.
4. `npm start` (meglio se gestito da PM2, systemd o Docker), dietro un proxy HTTPS (Nginx o Caddy).
5. Fai in modo che la cartella `data/` sia persistente e inclusa nei backup.

**Passaggio a PostgreSQL**: la struttura dati è in `server/migrations/`. Basta riscrivere `server/db.js` per usare `pg` e
leggere un `DATABASE_URL`. Le route in `server/index.js` usano solo query SQL standard.

## Crediti immagini
- Foto reali del club: profilo pubblico Zeta Club (Wellhub) e articolo di *rosarydelsudArt News*. Vanno sostituite con foto ufficiali ad alta risoluzione.
- Altre foto: [Unsplash](https://unsplash.com/license), uso libero.
- Il simbolo del logo in SVG è una ricostruzione provvisoria: va sostituito con il file vettoriale ufficiale.

## App del cliente (`/app`)

Web app installabile (PWA) per i clienti: su iPhone si apre in Safari e si aggiunge alla schermata Home
(Condividi → "Aggiungi alla schermata Home"), poi si usa a schermo intero come un'app.

- **Oggi**: prossimo appuntamento, allenamento consigliato (il giorno di scheda fatto meno di recente), ultima visita.
- **Agenda**: tutti gli appuntamenti futuri (visite, consulenze, personal, Visbody).
- **Scheda**: la scheda attiva divisa per giorni; per ogni esercizio si segna il peso usato oggi
  (salvataggio automatico, uno per esercizio al giorno) e si vede l'andamento nel tempo.
- **Visita**: risultati dell'ultima analisi Visbody, confrontati con quella precedente.

File: `public/app/` (interfaccia), `server/app-cliente.js` (API `/api/app`), `server/migrations/004_app_cliente.sql`
(tabelle `schede`, `schede_giorni`, `schede_esercizi`, `registro_pesi`, `visite`).
Solo il ruolo `cliente` può usarla. Account di prova: `cliente@demo.it`.

Schede e visite per ora si inseriscono nel database (i dati demo li crea `server/seed.js`):
manca ancora la schermata con cui il trainer le compila.
Se modifichi `public/app/app.js` o `app.css`, aumenta `VERSIONE` in `public/app/sw.js` così i telefoni si aggiornano.

## App dello staff (`/app`, stesso indirizzo dei clienti)

L'app riconosce il ruolo di chi entra e mostra sezioni diverse (file: `public/app/staff.js`, API `server/staff.js` su `/api/staff`,
tabelle in `server/migrations/005_staff_app.sql`):

| Ruolo | Sezioni |
|---|---|
| Trainer | **Agenda** (+ impegni), **Schede** (crea/modifica la scheda di ogni cliente, con nota per ogni esercizio), **Turni** (cambi turno) |
| Receptionist | **Attività** (aggiungi, spunta, elimina), **Turni** (cambi turno), **Agenda** (+ impegni) |
| Consulente | **Chiamate** (aggiungi, esito + note), **Agenda** (+ impegni) |
| Istruttore | **Agenda** (+ impegni) |

- **Impegni**: ognuno aggiunge i propri; compaiono anche nell'area riservata del sito.
- **Cambio turno** (solo tra colleghi dello stesso ruolo): *copertura* (il collega prende il tuo turno) o *scambio*
  (vi scambiate due turni). Il collega accetta o rifiuta dall'app; se accetta i turni si aggiornano subito.
  Il server ricontrolla che nessuno finisca con due turni sovrapposti.
- **Schede**: "Salva modifiche" aggiorna la scheda attiva mantenendo i pesi già segnati dal cliente;
  "Salva come nuova" archivia la vecchia e ne crea una nuova (lo storico pesi riparte da zero).

Account di prova in più (per provare i cambi turno dai due lati):
`reception2@demo.it` / `Reception2026!` (Sara) e `trainer2@demo.it` / `Trainer2026!` (Luca).
