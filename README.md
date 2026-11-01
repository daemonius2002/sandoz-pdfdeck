# PDF Deck — prezentări InDesign interactive pe iPad

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
| `ADMIN_PASSWORD` | – | parola pentru /admin (fără ea, admin-ul e deschis) |
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
