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
