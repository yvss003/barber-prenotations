# Abdul Barber — prenotazioni

Web app multilingue per prenotare taglio o barba, con area barbiere semplificata. Funziona su telefoni Android, iPhone, tablet e computer moderni.

## Prova immediata

Fai doppio clic su `index.html`. La modalità prova salva i dati soltanto nel browser utilizzato.

Area barbiere di prova: PIN `123456`.

## Pubblicazione gratuita su Cloudflare Pages

1. Crea un account Cloudflare e un progetto **Pages** collegato a questa cartella tramite GitHub, oppure carica i file con Wrangler.
2. In **Storage & Databases → D1**, crea un database chiamato `abdul-barber`.
3. Apri la console del database, incolla `migrations/0001_schema.sql` ed eseguilo.
4. Nel progetto Pages apri **Settings → Bindings → Add → D1 database**. Usa il nome variabile `DB` e seleziona `abdul-barber`.
5. In **Settings → Variables and Secrets**, crea un segreto cifrato chiamato `ADMIN_PIN`. Come valore scegli un PIN personale di 6 numeri, non facile da indovinare.
6. Pubblica il sito. La modalità Cloudflare viene attivata automaticamente quando è online.

Il PIN non viene scritto nei file pubblici. L’accesso resta memorizzato in modo sicuro per 30 giorni sul telefono del barbiere.

## Funzioni presenti

- Italiano, arabo con scrittura da destra a sinistra, francese e spagnolo.
- Orari: lunedì 12–19, mercoledì 10–19, altri giorni 9–19; pausa 13–14.
- Taglio 45 minuti più 5 di margine; barba 10 minuti più 5; taglio + barba 55 minuti più 5.
- Blocco automatico delle doppie prenotazioni.
- Agenda quotidiana, conteggio clienti, prossimo cliente, chiamata e WhatsApp.
- Blocco di un orario o di tutta una giornata.
- Accesso del barbiere con PIN di 6 cifre e protezione dai tentativi ripetuti.

## Messaggi sul telefono

Dopo la prenotazione il cliente trova un grande pulsante che apre WhatsApp con la conferma già compilata e indirizzata ad Abdul. Deve solamente premere **Invia**. Gli SMS o WhatsApp completamente automatici richiedono normalmente un servizio esterno a pagamento; per questo la versione a costo zero usa questo passaggio gratuito.

Prima della pubblicazione va completata l’informativa privacy con i dati legali del titolare.
