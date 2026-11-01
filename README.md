# SANDOZ PRESENTING DECK — prezentări InDesign interactive pe iPad

Încarci PDF-ul exportat din InDesign (*File → Export → Adobe PDF (Interactive)*), primești o adresă
`https://server/p/nume-prezentare` și o deschizi pe iPad pe tot ecranul, cu butoanele funcționale.

## Pornire

```bash
npm install
ADMIN_PASSWORD=parola-ta npm start          # http://localhost:3000/admin
```
sau cu Docker: `docker compose up -d` (editează parola în `docker-compose.yml`).

Pentru iPad ai nevoie de **HTTPS** (service worker / offline / ecran principal) — pune serverul în spatele
unui reverse proxy (Caddy, Nginx, Cloudflare Tunnel etc.).

| Variabilă | Implicit | Rol |
|---|---|---|
| `ADMIN_PASSWORD` | – | parola contului `admin`, folosită **doar la prima pornire** (când nu există încă niciun administrator) |
| `ADMIN_USERNAME` | `admin` | numele contului de administrator creat la prima pornire |
| `ADMIN_RESET_PASSWORD` | – | urgență: resetează parola administratorului la pornire; șterge variabila după |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | – | serverul de email pentru notificări (`SMTP_SECURE=true` pentru portul 465) |
| `PORT` | 3000 | |
| `DATA_DIR` | `./data` | PDF-uri, analize, miniaturi, `decks.json` |
| `PUBLIC_URL` | – | adresa publică folosită în linkuri/QR |
| `MAX_UPLOAD_MB` | 500 | |

## Publicare pe Railway

1. Railway → **New Project → Deploy from GitHub repo** → alege `sandoz-pdfdeck`.
2. În serviciul creat: **Settings → Volumes → New Volume**, *mount path* `/data` (aici stau PDF-urile).
3. **Variables**: `ADMIN_PASSWORD` = o parolă lungă, aleasă de tine.
4. **Settings → Networking → Generate Domain** (sau *Custom Domain* pentru domeniul tău).
5. După primul deploy, adaugă și `PUBLIC_URL` = adresa de la pasul 4 (de ex. `https://sandoz-pdfdeck.up.railway.app`).
6. Deschide `/admin`, intră cu parola, alege catalogul și limba, încarcă PDF-ul. Raportul apare imediat.

Fiecare `git push` pe ramura principală publică automat o versiune nouă; PDF-urile din volum rămân.

## Conturi, roluri, jurnal

- **Administrator**: tot, inclusiv utilizatori, setări și jurnal.
- **Editor**: încarcă, înlocuiește, editează și șterge prezentări; vede statisticile.
- **Prezentator**: vede biblioteca și prezintă.

Din `/admin`:
- **Utilizatori**: adaugi conturi (cu parolă generată), schimbi rolul, resetezi parola, dezactivezi sau ștergi; vezi sesiunile active și le poți închide.
  Conturile noi își aleg singure parola la prima logare.
- **Jurnal**: autentificări (inclusiv eșuate), conturi blocate, încărcări, ștergeri, modificări, fiecare deschidere de prezentare — cu filtre și export CSV.
- **Statistici**: deschideri pe prezentare, ultimele deschideri, autentificări eșuate.
- **Setări**: numele platformei, cine poate deschide prezentările (doar cu cont sau oricine are linkul),
  durata sesiunii, blocarea după încercări greșite, setările implicite ale prezentărilor.
- **Contul meu**: schimbarea parolei (deconectează celelalte dispozitive).

- **Grupuri de acces** (în *Utilizatori*): un grup dă acces la anumite cataloage și/sau limbi (de ex. „Romandia” → FR).
  Un prezentator setat pe „Doar ale grupurilor alese” vede numai acele prezentări — și nici PDF-ul celorlalte nu i se trimite.
- **Backup**: automat o dată pe zi (se păstrează ultimele N), manual la cerere, descărcare, ștergere și restaurare
  (dintr-un backup de pe server sau dintr-un fișier). Înainte de restaurare se face automat o copie a stării actuale;
  după restaurare serverul repornește singur.
- **Notificări pe email** (în *Setări*): cont blocat, multe logări eșuate, prezentare nouă / versiune nouă, prezentare ștearsă,
  utilizatori creați / șterși / dezactivați, backup eșuat. Buton pentru email de test.

Parolele sunt stocate doar ca hash (scrypt). Parola serverului de email stă doar în variabilele de mediu, nu în date sau în backup. Datele stau în `DATA_DIR`: `users.json`, `sessions.json`, `settings.json`, `decks.json`, `logs/`.

## Cine vede ce prezentare

- **Administratorii și editorii** văd toate prezentările.
- **Prezentatorii** văd fie *toate prezentările*, fie *doar prezentările alese* pentru contul lor.
- Atribuirea se face în două locuri, cu același efect:
  - **Utilizatori → modifică** (la coloana Acces): bifezi prezentările pentru acel cont;
  - **Prezentări → ⚙ Setări → Cine vede prezentarea**: bifezi prezentatorii care o văd.
- Opțional, **grupurile** dau acces la un catalog / o limbă întreagă (de ex. tot ce e în FR).
- Un prezentator care deschide linkul unei prezentări neatribuite vede mesajul „Fără acces”.
- Fiecare PDF încărcat devine o prezentare nouă; o versiune nouă a aceleiași prezentări se urcă din
  **⚙ Setări → Înlocuiește PDF-ul** (linkul rămâne același).

## Locația logărilor și harta

Fiecare logare, logare eșuată și deschidere de prezentare primește locația aproximativă (țară, oraș),
calculată **pe server** din adresa IP, în baza de date gratuită DB-IP „IP to City Lite” (licență CC BY 4.0).
Nicio adresă IP nu este trimisă către alt serviciu. La prima pornire serverul descarcă baza (~120 MB) în
`/data/geo` și o reîmprospătează lunar; până se termină descărcarea, harta afișează un mesaj.

- **Panou** → harta (fundal OpenStreetMap, gratuit, fără cheie; noaptea harta devine închisă), filtre Deschideri / Logări / Eșuate,
  tabel cu țări și orașe, activitate recentă.
- **Jurnal** și **Sesiuni active** au coloana *Locație*; exportul CSV o include.
- Variabile opționale: `GEOIP=off` oprește localizarea; `GEOIP_DB_PATH=/cale/fisier.mmdb` folosește altă bază
  (de ex. MaxMind GeoLite2-City).
- Locația după IP este aproximativă (orașul furnizorului de internet; prin VPN apare țara VPN-ului).

## Limbă și temă

Interfața (admin, logare, ecranul de start al prezentării) este în **română și engleză**, iar tema poate fi **Zi**, **Noapte** sau **Automat** (după setarea dispozitivului).
Butoanele RO | EN și Zi | Noapte | Automat sunt în colțul de sus; alegerea se ține minte pe fiecare dispozitiv.

## Flux de lucru

1. Încarci PDF-ul în `/admin` (Catalog + Limba; limba se detectează din nume: `ger`/`de`, `fr`, `ita`/`it`…).
2. Primești **raportul**: erori (butoane care nu vor funcționa), avertismente, informații — cu sfatul de reparare și pagina.
3. Pentru o altă limbă din același catalog, raportul include **comparația cu varianta de referință** (implicit DE):
   butoane care duc în altă parte, butoane lipsă sau în plus, linkuri diferite.
4. **▶ PLAY** deschide prezentarea; pe iPad *Share → Add to Home Screen* pentru ecran complet, fără bare de browser.
5. Aceeași limbă încărcată din nou = versiune nouă, același link.

## Ce interactivitate din InDesign funcționează

| Acțiune InDesign | Suport |
|---|---|
| Go To Next / Previous / First / Last Page, Go To Previous View | ✅ |
| Go To Page / Go To Destination (bookmark, hyperlink destination) | ✅ |
| Hyperlinks & Go To URL (inclusiv mailto:, tel:) | ✅ |
| Show/Hide Buttons and Forms (pop-up-uri) | ✅ (JavaScript și /Hide) |
| Mai multe acțiuni pe același buton | ✅ |
| Evenimente On Release / On Click | ✅ |
| Page transitions din PDF | ✅ (aproximate: fade / slide) |
| Rollover / aspect „Click” al butonului | ❌ (pe touch nu există hover) |
| Video / sunet / animații / Multi-state objects | ❌ (nu se exportă util în PDF) |

Admin-ul îți arată după încărcare câte butoane a găsit și ce acțiuni a ignorat.

## Pe iPad

- **Pe tot ecranul, fără taburi:** în Safari deschide linkul → *Share → Add to Home Screen*. Iconița de pe
  ecranul principal deschide prezentarea fără nicio bară de browser (iconița = prima pagină).
  Alternativ, butonul „Pornește pe tot ecranul” folosește full screen-ul din Safari.
- **Meniu (pagini, full screen):** ține apăsat ~1 secundă sau atinge cu două degete. Tastatură: săgeți, `M`, `F`.
- **Offline:** după prima deschidere, prezentarea rămâne disponibilă fără internet pe acel iPad.
- **Înlocuiește PDF-ul** din admin păstrează aceeași adresă — iPad-ul primește automat noua versiune.

## Cum funcționează

La încărcare, serverul (`lib/analyze.js`, pdf-lib) citește toate butoanele și linkurile (inclusiv `/AA`,
lanțuri `/Next`, JavaScript-ul de show/hide generat de InDesign) și salvează o hartă de acțiuni.
Viewer-ul (`public/viewer.js`) desenează paginile cu PDF.js, pune zone de atingere peste butoane și
execută acțiunile; pop-up-urile sunt redesenate prin vizibilitatea anotărilor în PDF.js.

Test: `node test/make-test-pdf.js` + `python3 test/e2e.py http://localhost:3000`.
