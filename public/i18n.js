// Interface language (Romanian / English) and colour theme (day / night / automatic).
// Both choices are remembered per device. The language is also sent to the server
// (cookie) so its messages come back in the same language.

const RO = {
  // shell
  'app.admin': 'Administrare',
  'nav.decks': 'Prezentări', 'nav.stats': 'Statistici', 'nav.users': 'Utilizatori', 'nav.log': 'Jurnal',
  'nav.settings': 'Setări', 'nav.backup': 'Backup', 'nav.account': 'Contul meu',
  'top.logout': 'Ieșire', 'theme.light': 'Zi', 'theme.dark': 'Noapte', 'theme.auto': 'Automat',
  'theme.label': 'Temă', 'lang.label': 'Limbă',
  'role.admin': 'Administrator', 'role.editor': 'Editor', 'role.viewer': 'Prezentator',
  'role.admin.long': 'Administrator — tot, inclusiv utilizatori și setări',
  'role.editor.long': 'Editor — încarcă, înlocuiește, șterge prezentări',
  'role.viewer.long': 'Prezentator — vede și prezintă',
  'common.saved': 'Salvat', 'common.close': 'Închide', 'common.cancel': 'Renunță', 'common.save': 'Salvează',
  'common.delete': 'Șterge', 'common.confirmDelete': 'Confirmi ștergerea?', 'common.confirm': 'Confirmi?',
  'common.error': 'Eroare', 'common.loading': 'Se încarcă…', 'common.copy': 'Copiază:', 'common.all': 'toate',
  'common.none': '—', 'common.device': 'Dispozitiv',

  // login
  'login.title': 'Autentificare', 'login.user': 'Utilizator', 'login.password': 'Parolă', 'login.go': 'Intră',
  'login.forgot': 'Ai uitat parola? Cere administratorului să ți-o reseteze.',
  'login.failed': 'Autentificarea nu a reușit.', 'login.offline': 'Serverul nu răspunde. Verifică conexiunea.',
  'login.setup': 'Nu există încă un administrator. Setează ADMIN_PASSWORD pe server și repornește-l.',

  // presentations
  'up.catalog': 'Catalog', 'up.catalogPh': 'de ex. Zeigebuch', 'up.lang': 'Limba',
  'up.langAuto': 'Detectează din numele fișierului', 'lang.XX': 'Altă limbă',
  'up.drop': 'Trage aici PDF-ul exportat din InDesign', 'up.dropOr': 'sau apasă pentru a alege fișierul.',
  'up.dropHint': 'Export din InDesign: File → Export → Adobe PDF (Interactive). După încărcare primești raportul de probleme.',
  'up.uploading': 'Încarc', 'up.replacing': 'Înlocuiesc', 'up.analyzing': '— analizez butoanele…', 'up.thumb': '— generez miniatura…',
  'up.cut': '— conexiune întreruptă', 'up.done': 'Prezentare adăugată', 'up.replaced': 'PDF înlocuit — linkul rămâne același',
  'decks.emptyEditor': 'Nicio prezentare încă. Încarcă primul PDF mai sus.', 'decks.empty': 'Nu există încă prezentări.',
  'deck.reference': 'referință', 'deck.publicLink': 'link public', 'deck.present': 'Prezintă',
  'deck.meta': '{pages} pagini · {buttons} butoane/linkuri · {size} · v{version} · {date} · {views} deschideri',
  'deck.lastView': ' (ultima: {date}, {who})', 'deck.public': 'link public',
  'deck.errors': '✖ {n} erori — vezi raportul', 'deck.error1': '✖ 1 eroare — vezi raportul', 'deck.warnings': '⚠ {n} avertismente',
  'deck.noButtons': '⚠ Nu am găsit butoane. Exportă din InDesign ca „Adobe PDF (Interactive)”.',
  'deck.title': 'Titlu', 'deck.address': 'Adresă',
  'deck.play': '▶ PLAY', 'deck.report': 'Raport', 'deck.copy': 'Copiază link', 'deck.qr': 'Cod QR', 'deck.replace': 'Înlocuiește PDF-ul',
  'deck.settings': 'Setări prezentare', 'deck.catalog': 'Catalog', 'deck.lang': 'Limba',
  'deck.isReference': 'Referință pentru comparația între limbi',
  'deck.copied': 'Link copiat', 'deck.deleted': 'Prezentarea a fost ștearsă',
  'qr.hint': 'Scanează cu camera iPad-ului pentru a deschide prezentarea.',
  'ps.swipe': 'Navigare liberă: glisare cu degetul și săgețile tastaturii (debifat = doar butoanele din PDF)',
  'ps.tapZones': 'Atingere pe marginea stângă/dreaptă schimbă pagina',
  'ps.resetOnPageEnter': 'Pop-up-urile (show/hide) se închid la schimbarea paginii',
  'ps.pageIndicator': 'Afișează numărul paginii', 'ps.transition': 'Tranziție',
  'ps.slide': 'Glisare', 'ps.fade': 'Estompare', 'ps.none': 'Fără',
  'ps.background': 'Culoare fundal', 'ps.publicLink': 'Link public (se deschide fără cont)',

  // report
  'sev.error': 'Eroare', 'sev.warning': 'Avertisment', 'sev.info': 'Informație',
  'rep.meta': '{pages} pagini · {buttons} butoane și linkuri',
  'rep.errors': 'erori', 'rep.warnings': 'avertismente', 'rep.infos': 'informații',
  'rep.verdictError': 'Prezentarea are erori: unele butoane nu vor funcționa. Corectează-le în InDesign și încarcă din nou PDF-ul.',
  'rep.verdictWarn': 'Prezentarea funcționează. Avertismentele de mai jos sunt lucruri de verificat.',
  'rep.verdictOk': 'Prezentarea funcționează fără probleme pe iPad.',
  'rep.compare': 'Comparație cu varianta {lang}',
  'rep.compareOk': 'Aceleași pagini și aceleași butoane, cu aceleași destinații ca în varianta de referință.',
  'rep.check': 'Verificarea PDF-ului', 'rep.none': 'Nicio problemă găsită.', 'rep.more': '… încă {n}', 'rep.page': 'p. {n}',

  // statistics
  'st.views': 'deschideri de prezentări (30 zile)', 'st.logins': 'autentificări (30 zile)',
  'st.failed': 'autentificări eșuate (30 zile)', 'st.users': 'utilizatori', 'st.sessions': 'sesiuni active',
  'st.decks': 'Prezentări', 'st.recent': 'Ultimele deschideri',
  'st.col.deck': 'Prezentare', 'st.col.lang': 'Limba', 'st.col.30': '30 zile', 'st.col.total': 'Total', 'st.col.last': 'Ultima deschidere',
  'st.col.when': 'Când', 'st.col.who': 'Cine', 'st.col.ip': 'IP', 'st.public': 'link public',
  'st.noDecks': 'Nu există încă prezentări.', 'st.noViews': 'Nicio deschidere în ultimele 30 de zile.',

  // users
  'us.add': 'Adaugă utilizator', 'us.username': 'Utilizator (pentru logare)', 'us.usernamePh': 'de ex. Alex1 sau Ana.Pop',
  'us.name': 'Nume afișat', 'us.namePh': 'Ana Pop', 'us.email': 'Email (opțional)', 'us.role': 'Rol',
  'us.password': 'Parolă inițială', 'us.generate': 'Generează', 'us.access': 'Acces la prezentări (pentru prezentatori)',
  'us.accessAll': 'Toate prezentările', 'us.accessGroups': 'Doar ale grupurilor alese',
  'us.must': 'Trebuie să-și schimbe parola la prima logare', 'us.create': 'Creează utilizatorul',
  'us.list': 'Utilizatori', 'us.sessions': 'Sesiuni active',
  'us.sessionsHint': 'Dispozitivele conectate acum. „Închide” deconectează dispozitivul imediat.',
  'us.col.user': 'Utilizator', 'us.col.name': 'Nume', 'us.col.role': 'Rol', 'us.col.access': 'Acces', 'us.col.status': 'Stare',
  'us.col.lastLogin': 'Ultima logare', 'us.col.sessions': 'Sesiuni',
  'us.col.device': 'Dispozitiv', 'us.col.ip': 'IP', 'us.col.lastSeen': 'Ultima activitate', 'us.col.expires': 'Expiră',
  'us.you': '(tu)', 'us.allByRole': 'toate (rol)', 'us.allDecks': 'toate', 'us.noGroup': 'niciun grup', 'us.edit': 'modifică',
  'us.disabled': 'dezactivat', 'us.mustChange': 'trebuie să schimbe parola', 'us.active': 'activ',
  'us.reset': 'Resetează parola', 'us.confirmReset': 'Confirmi resetarea?', 'us.disable': 'Dezactivează', 'us.enable': 'Reactivează',
  'us.closeSession': 'Închide', 'us.noSessions': 'Nicio sesiune activă.',
  'us.created': 'Utilizatorul „{u}” a fost creat',
  'us.createdText': 'Trimite-i datele de logare pe un canal separat. Parola nu mai poate fi văzută după ce închizi această fereastră.',
  'us.resetTitle': 'Parolă nouă pentru „{u}”',
  'us.resetText': 'Utilizatorul a fost deconectat de pe toate dispozitivele și își va alege o parolă nouă la prima logare.',
  'us.loginAddress': 'Adresa de logare', 'us.copyCreds': 'Copiază datele de logare', 'us.credsCopied': 'Datele de logare au fost copiate',
  'us.credsText': 'Adresa: {url}\nUtilizator: {u}\nParolă: {p}',
  'us.disabledToast': 'Cont dezactivat — utilizatorul a fost deconectat', 'us.enabledToast': 'Cont reactivat', 'us.deletedToast': 'Utilizator șters',
  'us.sessionClosed': 'Sesiune închisă',
  'us.err.noUser': 'Scrie numele de utilizator (cu el se face logarea).',
  'us.err.short': 'Numele de utilizator trebuie să aibă cel puțin 3 caractere.',
  'us.err.chars': 'Numele de utilizator poate conține doar litere fără diacritice, cifre, punct, minus sau underscore (de ex. Alex1 sau Ana.Pop).',
  'us.err.noPw': 'Scrie o parolă inițială sau apasă „Generează”.',
  'us.err.pwRules': 'Parola inițială nu respectă regulile de sub câmp. Apasă „Generează” pentru una sigură.',

  // groups
  'gr.title': 'Grupuri de acces',
  'gr.hint': 'Un grup dă acces la anumite cataloage și limbi, de exemplu „Romandia” → limba FR. Prezentatorii setați pe „Doar ale grupurilor alese” văd numai prezentările grupurilor lor. Editorii și administratorii văd tot.',
  'gr.col.group': 'Grup', 'gr.col.catalogs': 'Cataloage', 'gr.col.langs': 'Limbi', 'gr.col.decks': 'Prezentări', 'gr.col.members': 'Membri',
  'gr.none': 'Niciun grup încă. Fără grupuri, toți prezentatorii văd toate prezentările.',
  'gr.newName': 'Nume grup nou', 'gr.newNamePh': 'de ex. Romandia',
  'gr.catalogs': 'Cataloage (nimic bifat = toate)', 'gr.langs': 'Limbi (nimic bifat = toate)', 'gr.create': 'Creează grupul',
  'gr.uploadFirst': 'încarcă întâi o prezentare', 'gr.createFirst': 'Creează întâi un grup (mai jos).', 'gr.noGroups': 'Nu există încă grupuri.',
  'gr.created': 'Grup creat', 'gr.saved': 'Grup salvat', 'gr.deleted': 'Grup șters',
  'ac.title': 'Acces la prezentări', 'ac.all': 'Toate prezentările', 'ac.groups': 'Doar prezentările grupurilor alese:', 'ac.saved': 'Acces salvat',

  // log
  'lg.all': 'Toate evenimentele', 'lg.auth': 'Autentificări', 'lg.failed': 'Doar autentificări eșuate', 'lg.users': 'Utilizatori',
  'lg.decks': 'Prezentări (toate)', 'lg.views': 'Prezentări deschise', 'lg.settings': 'Setări', 'lg.backup': 'Backup',
  'lg.userPh': 'Utilizator', 'lg.searchPh': 'Caută (IP, prezentare, detalii)', 'lg.filter': 'Filtrează', 'lg.csv': 'Descarcă CSV', 'lg.more': 'Arată mai multe',
  'lg.col.when': 'Când', 'lg.col.event': 'Eveniment', 'lg.col.user': 'Utilizator', 'lg.col.target': 'Țintă', 'lg.col.detail': 'Detalii', 'lg.col.ip': 'IP',
  'lg.none': 'Niciun eveniment găsit.', 'lg.csvHead': 'data,eveniment,utilizator,tinta,detalii,ip,reusit', 'lg.yes': 'da', 'lg.no': 'nu',

  // settings
  'se.general': 'General', 'se.siteName': 'Numele platformei', 'se.access': 'Cine poate deschide prezentările',
  'se.accessLogin': 'Doar utilizatorii autentificați', 'se.accessPublic': 'Oricine are linkul',
  'se.accessHint': 'O prezentare anume poate fi deschisă fără cont dacă bifezi „Link public” în setările ei.',
  'se.logViews': 'Înregistrează în jurnal fiecare deschidere de prezentare',
  'se.security': 'Securitate', 'se.sessionDays': 'Sesiunea expiră după (zile)', 'se.maxAttempts': 'Încercări greșite până la blocare',
  'se.lockMinutes': 'Durata blocării (minute)', 'se.securityHint': 'Pe iPad, o sesiune lungă înseamnă că prezentatorii nu trebuie să se autentifice des.',
  'se.defaults': 'Setări implicite pentru prezentările noi',
  'se.notify': 'Notificări pe email', 'se.recipients': 'Destinatari (câte o adresă pe rând)', 'se.sendWhen': 'Trimite email când',
  'se.test': 'Trimite un email de test', 'se.save': 'Salvează setările', 'se.saved': 'Setările au fost salvate',
  'se.smtpOk': 'Serverul de email este configurat ({host}, expeditor {from}).',
  'se.smtpMissing': 'Serverul de email nu este configurat. Adaugă în Render, la Environment: <b>SMTP_HOST</b>, <b>SMTP_PORT</b>, <b>SMTP_USER</b>, <b>SMTP_PASS</b> și <b>SMTP_FROM</b>, apoi repornește serviciul.',
  'se.sending': 'Se trimite…', 'se.sent': 'Trimis către {to}. Verifică și folderul Spam.', 'se.badEmail': 'Adresă de email invalidă: {list}',
  'ev.locked': 'Un cont a fost blocat după prea multe parole greșite',
  'ev.failedBurst': 'Multe autentificări eșuate într-o oră (posibilă încercare de spargere)',
  'ev.upload': 'A fost încărcată o prezentare nouă sau o versiune nouă', 'ev.delete': 'A fost ștearsă o prezentare',
  'ev.users': 'A fost creat, șters sau dezactivat un utilizator', 'ev.backupFailed': 'Backup-ul automat nu a reușit',

  // backup
  'bk.auto': 'Backup automat',
  'bk.hint': 'Un backup conține utilizatorii, grupurile, setările, toate prezentările (PDF, rapoarte, miniaturi) și jurnalul. Backup-urile stau pe același disc ca platforma, așa că descarcă din când în când unul pe calculatorul tău.',
  'bk.daily': 'Fă un backup automat o dată pe zi', 'bk.keep1': 'păstrează ultimele', 'bk.keep2': 'backup-uri automate',
  'bk.list': 'Backup-uri', 'bk.now': 'Creează backup acum', 'bk.creating': 'Se creează…', 'bk.total': '{n} backup-uri · {size} pe disc',
  'bk.col.created': 'Creat', 'bk.col.kind': 'Tip', 'bk.col.size': 'Mărime', 'bk.kind.auto': 'automat', 'bk.kind.manual': 'manual',
  'bk.download': 'Descarcă', 'bk.restore': 'Restaurează', 'bk.confirmRestore': 'Confirmi? Înlocuiește tot', 'bk.restoring': 'Se restaurează…',
  'bk.none': 'Niciun backup încă. Primul backup automat se face la câteva minute după pornirea serverului.',
  'bk.created': 'Backup creat ({size})', 'bk.deleted': 'Backup șters',
  'bk.fromFile': 'Restaurare dintr-un fișier',
  'bk.fromFileHint': 'Înlocuiește toate datele actuale cu cele din backup. Înainte, platforma face automat o copie a stării actuale. Toată lumea va trebui să se autentifice din nou, iar serverul repornește (durează câteva secunde).',
  'bk.fromFileGo': 'Restaurează din fișier', 'bk.fromFileConfirm': 'Confirmi? Toate datele actuale vor fi înlocuite',
  'bk.uploading': 'Se încarcă… {p}%', 'bk.failed': 'Restaurarea nu a reușit.', 'bk.cut': 'Conexiunea s-a întrerupt.',
  'bk.doneTitle': 'Backup restaurat', 'bk.doneText': 'Serverul repornește cu datele din backup. Te trimit la pagina de autentificare în câteva secunde…',

  // account
  'acc.must': 'Pentru siguranță, alege o parolă nouă înainte de a continua. Regulile sunt afișate sub câmpul „Parola nouă” și se bifează pe măsură ce scrii.', 'acc.title': 'Contul meu',
  'acc.user': 'Utilizator', 'acc.name': 'Nume', 'acc.role': 'Rol', 'acc.lastLogin': 'Ultima logare',
  'acc.change': 'Schimbă parola', 'acc.current': 'Parola actuală', 'acc.new': 'Parola nouă', 'acc.new2': 'Repetă parola nouă',
  'acc.hint': 'După schimbare, celelalte dispozitive conectate sunt deconectate.',
  'pw.title': 'Parola trebuie să aibă:', 'pw.len': 'cel puțin 8 caractere', 'pw.lower': 'o literă mică (a–z)',
  'pw.upper': 'o literă mare (A–Z)', 'pw.special': 'un caracter special, de ex. @ # ! $ % & *', 'pw.match': 'aceeași parolă scrisă de două ori',
  'pw.notMet': 'Parola nu respectă încă toate regulile de mai jos.',
  'pw.show': 'Arată parola', 'pw.hide': 'Ascunde parola', 'pw.generate': 'Generează o parolă',
  'pw.generated': 'Am generat o parolă sigură și am completat-o în ambele câmpuri. Notează-o înainte să apeși „Schimbă parola”.',
  'acc.mismatch': 'Parolele noi nu coincid.', 'acc.changed': 'Parola a fost schimbată',

  // presenter
  'pv.loading': 'Se încarcă prezentarea…', 'pv.preparing': 'Se pregătește…', 'pv.loadFailed': 'Prezentarea nu a putut fi încărcată.',
  'pv.start': 'Pornește pe tot ecranul', 'pv.startPlain': 'Pornește', 'pv.window': 'Fără full screen',
  'pv.hint': 'Ține apăsat o secundă oriunde (sau atinge cu două degete) pentru meniu.',
  'pv.hintHome': 'Pentru ecran complet: apasă <b>Share → Add to Home Screen</b> și deschide prezentarea de pe ecranul principal.<br><br>Ține apăsat o secundă (sau atinge cu două degete) pentru meniu.',
  'pv.fs': 'Full screen', 'pv.fsExit': 'Ieși din full screen', 'pv.back': 'Înapoi la prezentare',
  'pv.offline': '✓ Disponibilă și offline pe acest dispozitiv', 'pv.debug': 'Arată zonele interactive',
};

const EN = {
  'app.admin': 'Administration',
  'nav.decks': 'Presentations', 'nav.stats': 'Statistics', 'nav.users': 'Users', 'nav.log': 'Activity log',
  'nav.settings': 'Settings', 'nav.backup': 'Backup', 'nav.account': 'My account',
  'top.logout': 'Sign out', 'theme.light': 'Day', 'theme.dark': 'Night', 'theme.auto': 'Auto',
  'theme.label': 'Theme', 'lang.label': 'Language',
  'role.admin': 'Administrator', 'role.editor': 'Editor', 'role.viewer': 'Presenter',
  'role.admin.long': 'Administrator — everything, including users and settings',
  'role.editor.long': 'Editor — uploads, replaces and deletes presentations',
  'role.viewer.long': 'Presenter — sees and presents',
  'common.saved': 'Saved', 'common.close': 'Close', 'common.cancel': 'Cancel', 'common.save': 'Save',
  'common.delete': 'Delete', 'common.confirmDelete': 'Confirm delete?', 'common.confirm': 'Confirm?',
  'common.error': 'Error', 'common.loading': 'Loading…', 'common.copy': 'Copy:', 'common.all': 'all',
  'common.none': '—', 'common.device': 'Device',

  'login.title': 'Sign in', 'login.user': 'Username', 'login.password': 'Password', 'login.go': 'Sign in',
  'login.forgot': 'Forgot your password? Ask the administrator to reset it.',
  'login.failed': 'Sign-in failed.', 'login.offline': 'The server is not responding. Check your connection.',
  'login.setup': 'There is no administrator yet. Set ADMIN_PASSWORD on the server and restart it.',

  'up.catalog': 'Catalogue', 'up.catalogPh': 'e.g. Zeigebuch', 'up.lang': 'Language',
  'up.langAuto': 'Detect from the file name', 'lang.XX': 'Other language',
  'up.drop': 'Drop the PDF exported from InDesign here', 'up.dropOr': 'or click to choose the file.',
  'up.dropHint': 'InDesign export: File → Export → Adobe PDF (Interactive). You get the problem report right after uploading.',
  'up.uploading': 'Uploading', 'up.replacing': 'Replacing', 'up.analyzing': '— checking the buttons…', 'up.thumb': '— creating the thumbnail…',
  'up.cut': '— connection lost', 'up.done': 'Presentation added', 'up.replaced': 'PDF replaced — the link stays the same',
  'decks.emptyEditor': 'No presentations yet. Upload the first PDF above.', 'decks.empty': 'There are no presentations yet.',
  'deck.reference': 'reference', 'deck.publicLink': 'public link', 'deck.present': 'Present',
  'deck.meta': '{pages} pages · {buttons} buttons/links · {size} · v{version} · {date} · {views} views',
  'deck.lastView': ' (last: {date}, {who})', 'deck.public': 'public link',
  'deck.errors': '✖ {n} errors — see the report', 'deck.error1': '✖ 1 error — see the report', 'deck.warnings': '⚠ {n} warnings',
  'deck.noButtons': '⚠ No buttons found. Export from InDesign as “Adobe PDF (Interactive)”.',
  'deck.title': 'Title', 'deck.address': 'Address',
  'deck.play': '▶ PLAY', 'deck.report': 'Report', 'deck.copy': 'Copy link', 'deck.qr': 'QR code', 'deck.replace': 'Replace PDF',
  'deck.settings': 'Presentation settings', 'deck.catalog': 'Catalogue', 'deck.lang': 'Language',
  'deck.isReference': 'Reference for comparing languages',
  'deck.copied': 'Link copied', 'deck.deleted': 'Presentation deleted',
  'qr.hint': 'Scan with the iPad camera to open the presentation.',
  'ps.swipe': 'Free navigation: finger swipe and keyboard arrows (unticked = only the PDF buttons)',
  'ps.tapZones': 'Tapping the left/right edge changes the page',
  'ps.resetOnPageEnter': 'Pop-ups (show/hide) close when the page changes',
  'ps.pageIndicator': 'Show the page number', 'ps.transition': 'Transition',
  'ps.slide': 'Slide', 'ps.fade': 'Fade', 'ps.none': 'None',
  'ps.background': 'Background colour', 'ps.publicLink': 'Public link (opens without an account)',

  'sev.error': 'Error', 'sev.warning': 'Warning', 'sev.info': 'Info',
  'rep.meta': '{pages} pages · {buttons} buttons and links',
  'rep.errors': 'errors', 'rep.warnings': 'warnings', 'rep.infos': 'notes',
  'rep.verdictError': 'The presentation has errors: some buttons will not work. Fix them in InDesign and upload the PDF again.',
  'rep.verdictWarn': 'The presentation works. The warnings below are things worth checking.',
  'rep.verdictOk': 'The presentation works on the iPad with no problems.',
  'rep.compare': 'Comparison with the {lang} version',
  'rep.compareOk': 'Same pages and same buttons, going to the same places as in the reference version.',
  'rep.check': 'PDF check', 'rep.none': 'No problems found.', 'rep.more': '… {n} more', 'rep.page': 'p. {n}',

  'st.views': 'presentation views (30 days)', 'st.logins': 'sign-ins (30 days)',
  'st.failed': 'failed sign-ins (30 days)', 'st.users': 'users', 'st.sessions': 'active sessions',
  'st.decks': 'Presentations', 'st.recent': 'Latest views',
  'st.col.deck': 'Presentation', 'st.col.lang': 'Language', 'st.col.30': '30 days', 'st.col.total': 'Total', 'st.col.last': 'Last viewed',
  'st.col.when': 'When', 'st.col.who': 'Who', 'st.col.ip': 'IP', 'st.public': 'public link',
  'st.noDecks': 'There are no presentations yet.', 'st.noViews': 'No views in the last 30 days.',

  'us.add': 'Add user', 'us.username': 'Username (for signing in)', 'us.usernamePh': 'e.g. Alex1 or Ana.Pop',
  'us.name': 'Display name', 'us.namePh': 'Ana Pop', 'us.email': 'Email (optional)', 'us.role': 'Role',
  'us.password': 'Initial password', 'us.generate': 'Generate', 'us.access': 'Access to presentations (for presenters)',
  'us.accessAll': 'All presentations', 'us.accessGroups': 'Only those of the chosen groups',
  'us.must': 'Must change the password at first sign-in', 'us.create': 'Create user',
  'us.list': 'Users', 'us.sessions': 'Active sessions',
  'us.sessionsHint': 'Devices signed in right now. “Close” signs the device out immediately.',
  'us.col.user': 'Username', 'us.col.name': 'Name', 'us.col.role': 'Role', 'us.col.access': 'Access', 'us.col.status': 'Status',
  'us.col.lastLogin': 'Last sign-in', 'us.col.sessions': 'Sessions',
  'us.col.device': 'Device', 'us.col.ip': 'IP', 'us.col.lastSeen': 'Last activity', 'us.col.expires': 'Expires',
  'us.you': '(you)', 'us.allByRole': 'all (role)', 'us.allDecks': 'all', 'us.noGroup': 'no group', 'us.edit': 'change',
  'us.disabled': 'disabled', 'us.mustChange': 'must change password', 'us.active': 'active',
  'us.reset': 'Reset password', 'us.confirmReset': 'Confirm reset?', 'us.disable': 'Disable', 'us.enable': 'Enable',
  'us.closeSession': 'Close', 'us.noSessions': 'No active sessions.',
  'us.created': 'User “{u}” created',
  'us.createdText': 'Send the sign-in details through a separate channel. The password cannot be shown again after you close this window.',
  'us.resetTitle': 'New password for “{u}”',
  'us.resetText': 'The user was signed out on every device and will choose a new password at the next sign-in.',
  'us.loginAddress': 'Sign-in address', 'us.copyCreds': 'Copy sign-in details', 'us.credsCopied': 'Sign-in details copied',
  'us.credsText': 'Address: {url}\nUsername: {u}\nPassword: {p}',
  'us.disabledToast': 'Account disabled — the user was signed out', 'us.enabledToast': 'Account enabled', 'us.deletedToast': 'User deleted',
  'us.sessionClosed': 'Session closed',
  'us.err.noUser': 'Enter a username (it is used to sign in).',
  'us.err.short': 'The username needs at least 3 characters.',
  'us.err.chars': 'The username can only contain letters without accents, digits, dot, minus or underscore (e.g. Alex1 or Ana.Pop).',
  'us.err.noPw': 'Enter an initial password or click “Generate”.',
  'us.err.pwRules': 'The initial password does not meet the rules under the field. Click “Generate” for a strong one.',

  'gr.title': 'Access groups',
  'gr.hint': 'A group gives access to some catalogues and languages, e.g. “Romandia” → French. Presenters set to “Only those of the chosen groups” see only their groups’ presentations. Editors and administrators see everything.',
  'gr.col.group': 'Group', 'gr.col.catalogs': 'Catalogues', 'gr.col.langs': 'Languages', 'gr.col.decks': 'Presentations', 'gr.col.members': 'Members',
  'gr.none': 'No groups yet. Without groups, every presenter sees every presentation.',
  'gr.newName': 'New group name', 'gr.newNamePh': 'e.g. Romandia',
  'gr.catalogs': 'Catalogues (none ticked = all)', 'gr.langs': 'Languages (none ticked = all)', 'gr.create': 'Create group',
  'gr.uploadFirst': 'upload a presentation first', 'gr.createFirst': 'Create a group first (below).', 'gr.noGroups': 'There are no groups yet.',
  'gr.created': 'Group created', 'gr.saved': 'Group saved', 'gr.deleted': 'Group deleted',
  'ac.title': 'Access to presentations', 'ac.all': 'All presentations', 'ac.groups': 'Only the presentations of these groups:', 'ac.saved': 'Access saved',

  'lg.all': 'All events', 'lg.auth': 'Sign-ins', 'lg.failed': 'Failed sign-ins only', 'lg.users': 'Users',
  'lg.decks': 'Presentations (all)', 'lg.views': 'Presentations opened', 'lg.settings': 'Settings', 'lg.backup': 'Backup',
  'lg.userPh': 'Username', 'lg.searchPh': 'Search (IP, presentation, details)', 'lg.filter': 'Filter', 'lg.csv': 'Download CSV', 'lg.more': 'Show more',
  'lg.col.when': 'When', 'lg.col.event': 'Event', 'lg.col.user': 'User', 'lg.col.target': 'Target', 'lg.col.detail': 'Details', 'lg.col.ip': 'IP',
  'lg.none': 'No events found.', 'lg.csvHead': 'date,event,user,target,details,ip,succeeded', 'lg.yes': 'yes', 'lg.no': 'no',

  'se.general': 'General', 'se.siteName': 'Platform name', 'se.access': 'Who can open presentations',
  'se.accessLogin': 'Signed-in users only', 'se.accessPublic': 'Anyone with the link',
  'se.accessHint': 'A single presentation can open without an account if you tick “Public link” in its settings.',
  'se.logViews': 'Record every presentation view in the activity log',
  'se.security': 'Security', 'se.sessionDays': 'Session expires after (days)', 'se.maxAttempts': 'Wrong attempts before lock-out',
  'se.lockMinutes': 'Lock-out duration (minutes)', 'se.securityHint': 'On the iPad, a long session means presenters do not have to sign in often.',
  'se.defaults': 'Defaults for new presentations',
  'se.notify': 'Email notifications', 'se.recipients': 'Recipients (one address per line)', 'se.sendWhen': 'Send an email when',
  'se.test': 'Send a test email', 'se.save': 'Save settings', 'se.saved': 'Settings saved',
  'se.smtpOk': 'The mail server is configured ({host}, sender {from}).',
  'se.smtpMissing': 'The mail server is not configured. In Render → Environment, add <b>SMTP_HOST</b>, <b>SMTP_PORT</b>, <b>SMTP_USER</b>, <b>SMTP_PASS</b> and <b>SMTP_FROM</b>, then restart the service.',
  'se.sending': 'Sending…', 'se.sent': 'Sent to {to}. Check the Spam folder too.', 'se.badEmail': 'Invalid email address: {list}',
  'ev.locked': 'An account is locked after too many wrong passwords',
  'ev.failedBurst': 'Many failed sign-ins within an hour (possible break-in attempt)',
  'ev.upload': 'A new presentation or a new version is uploaded', 'ev.delete': 'A presentation is deleted',
  'ev.users': 'A user is created, deleted or disabled', 'ev.backupFailed': 'The automatic backup fails',

  'bk.auto': 'Automatic backup',
  'bk.hint': 'A backup holds the users, groups, settings, every presentation (PDF, reports, thumbnails) and the activity log. Backups live on the same disk as the platform, so download one to your computer from time to time.',
  'bk.daily': 'Make an automatic backup once a day', 'bk.keep1': 'keep the last', 'bk.keep2': 'automatic backups',
  'bk.list': 'Backups', 'bk.now': 'Back up now', 'bk.creating': 'Creating…', 'bk.total': '{n} backups · {size} on disk',
  'bk.col.created': 'Created', 'bk.col.kind': 'Type', 'bk.col.size': 'Size', 'bk.kind.auto': 'automatic', 'bk.kind.manual': 'manual',
  'bk.download': 'Download', 'bk.restore': 'Restore', 'bk.confirmRestore': 'Confirm? Replaces everything', 'bk.restoring': 'Restoring…',
  'bk.none': 'No backups yet. The first automatic backup runs a few minutes after the server starts.',
  'bk.created': 'Backup created ({size})', 'bk.deleted': 'Backup deleted',
  'bk.fromFile': 'Restore from a file',
  'bk.fromFileHint': 'Replaces all current data with the backup. The platform first saves a copy of the current state. Everyone has to sign in again and the server restarts (takes a few seconds).',
  'bk.fromFileGo': 'Restore from file', 'bk.fromFileConfirm': 'Confirm? All current data will be replaced',
  'bk.uploading': 'Uploading… {p}%', 'bk.failed': 'The restore failed.', 'bk.cut': 'The connection was lost.',
  'bk.doneTitle': 'Backup restored', 'bk.doneText': 'The server is restarting with the backup data. You will be taken to the sign-in page in a few seconds…',

  'acc.must': 'For safety, choose a new password before you continue. The rules are shown under “New password” and get ticked as you type.', 'acc.title': 'My account',
  'acc.user': 'Username', 'acc.name': 'Name', 'acc.role': 'Role', 'acc.lastLogin': 'Last sign-in',
  'acc.change': 'Change password', 'acc.current': 'Current password', 'acc.new': 'New password', 'acc.new2': 'Repeat new password',
  'acc.hint': 'Other signed-in devices are signed out after the change.',
  'pw.title': 'The password needs:', 'pw.len': 'at least 8 characters', 'pw.lower': 'a lowercase letter (a–z)',
  'pw.upper': 'a capital letter (A–Z)', 'pw.special': 'a special character, e.g. @ # ! $ % & *', 'pw.match': 'the same password typed twice',
  'pw.notMet': 'The password does not meet all the rules below yet.',
  'pw.show': 'Show password', 'pw.hide': 'Hide password', 'pw.generate': 'Generate a password',
  'pw.generated': 'A strong password was generated and filled into both fields. Write it down before you click “Change password”.',
  'acc.mismatch': 'The new passwords do not match.', 'acc.changed': 'Password changed',

  'pv.loading': 'Loading the presentation…', 'pv.preparing': 'Getting ready…', 'pv.loadFailed': 'The presentation could not be loaded.',
  'pv.start': 'Start full screen', 'pv.startPlain': 'Start', 'pv.window': 'Without full screen',
  'pv.hint': 'Press and hold anywhere for a second (or tap with two fingers) for the menu.',
  'pv.hintHome': 'For full screen: tap <b>Share → Add to Home Screen</b> and open the presentation from the home screen.<br><br>Press and hold for a second (or tap with two fingers) for the menu.',
  'pv.fs': 'Full screen', 'pv.fsExit': 'Exit full screen', 'pv.back': 'Back to the presentation',
  'pv.offline': '✓ Also available offline on this device', 'pv.debug': 'Show interactive areas',
};

// Activity-log event names
const EVENTS = {
  ro: {
    'auth.login': 'Autentificare', 'auth.login_failed': 'Autentificare eșuată', 'auth.locked': 'Cont blocat temporar', 'auth.logout': 'Deconectare',
    'auth.password_changed': 'Parolă schimbată', 'user.create': 'Utilizator creat', 'user.update': 'Utilizator modificat', 'user.delete': 'Utilizator șters',
    'session.revoke': 'Sesiune închisă', 'deck.upload': 'Prezentare încărcată', 'deck.replace': 'Versiune nouă încărcată', 'deck.update': 'Prezentare modificată',
    'deck.delete': 'Prezentare ștearsă', 'deck.view': 'Prezentare deschisă', 'settings.update': 'Setări modificate', 'group.create': 'Grup creat',
    'group.update': 'Grup modificat', 'group.delete': 'Grup șters', 'backup.create': 'Backup creat', 'backup.download': 'Backup descărcat',
    'backup.delete': 'Backup șters', 'backup.restore': 'Backup restaurat', 'notify.test': 'Email de test trimis', 'system.start': 'Server pornit',
  },
  en: {
    'auth.login': 'Sign-in', 'auth.login_failed': 'Failed sign-in', 'auth.locked': 'Account locked', 'auth.logout': 'Sign-out',
    'auth.password_changed': 'Password changed', 'user.create': 'User created', 'user.update': 'User changed', 'user.delete': 'User deleted',
    'session.revoke': 'Session closed', 'deck.upload': 'Presentation uploaded', 'deck.replace': 'New version uploaded', 'deck.update': 'Presentation changed',
    'deck.delete': 'Presentation deleted', 'deck.view': 'Presentation opened', 'settings.update': 'Settings changed', 'group.create': 'Group created',
    'group.update': 'Group changed', 'group.delete': 'Group deleted', 'backup.create': 'Backup created', 'backup.download': 'Backup downloaded',
    'backup.delete': 'Backup deleted', 'backup.restore': 'Backup restored', 'notify.test': 'Test email sent', 'system.start': 'Server started',
  },
};

// Report groups produced by the PDF check (by code), English versions
const ISSUES_EN = {
  broken: ['Buttons that go to a page that does not exist', 'In InDesign, check the button action (Window → Interactive → Buttons and Forms) and point it to the right page.'],
  'vis-target': ['Show/Hide aimed at buttons that do not exist', 'The button tries to show or hide an element that was deleted or renamed. Redo the Show/Hide action in InDesign.'],
  unsupported: ['Actions that cannot run on the iPad', 'Video, sound, forms or custom JavaScript are not supported. Replace them with a “Go To URL” button or a separate page.'],
  'no-action': ['Buttons with no action', 'The button is visible but does nothing when tapped. Add an action or turn it back into a plain object.'],
  'self-link': ['Buttons that point to the same page', 'Usually the active tab of a menu, which is fine. Otherwise check the target page (a typical mistake after duplicating pages).'],
  overlap: ['Overlapping buttons with different actions', 'The button on top wins when tapped. Move or shrink one of them.'],
  small: ['Buttons too small for a finger', 'They are under 30px on the iPad. Make the button area (it can be transparent) at least 1 cm.'],
  fonts: ['Fonts not embedded', 'The iPad replaces them with another font. Tick “Embed fonts” on export or convert the text to outlines.'],
  sizes: ['Pages with different sizes', 'The presentation will have different black borders from page to page.'],
  unreachable: ['Pages that no button leads to', 'They can only be reached by swiping or from the page menu. Fine if intended.'],
  'dead-end': ['Pages with no buttons', 'The presenter can leave them only by swiping or from the menu.'],
  external: ['External links (need internet)', 'On an offline iPad these links will not open.'],
  big: ['Large file', 'Over 20 MB loads slowly on the iPad. Export with images at 150–200 ppi.'],
  'cmp-pages': ['Different number of pages than {ref}', 'The versions should have the same pages in the same order.'],
  'cmp-target': ['Buttons going somewhere else than in {ref}', 'Probably a wrong link after translation. Check the button in InDesign.'],
  'cmp-missing': ['Buttons missing compared with {ref}', 'The button exists in the reference but not here (or was moved a lot).'],
  'cmp-extra': ['Extra buttons compared with {ref}', 'Check whether the button should exist.'],
  'cmp-url': ['External links different from {ref}', 'Normal if the links are localised (e.g. French pages). Just check they are the right ones.'],
};
const ITEM_EN = [
  [/destinația „(.+?)” nu există/g, 'destination “$1” does not exist'], [/pagina destinație nu există/g, 'target page does not exist'],
  [/buton fără nume/g, 'unnamed button'], [/alt buton/g, 'another button'], [/ și /g, ' and '], [/\(paginile /g, '(pages '], [/^paginile /g, 'pages '],
  [/(\d+) linkuri/g, '$1 links'], [/prima pagină/g, 'first page'], [/ pagini, aici: /g, ' pages, here: '], [/ pagini/g, ' pages'],
  [/ în (\w+) → /g, ' in $1 → '], [/, aici → /g, ', here → '], [/\(în (\w+): /g, '(in $1: '], [/\bbuton\b/g, 'button'],
];
const DETAIL_EN = [
  [/utilizator sau parolă greșită/g, 'wrong username or password'], [/cont dezactivat/g, 'account disabled'], [/\bdezactivat\b/g, 'disabled'],
  [/\breactivat\b/g, 'enabled'], [/parolă resetată prin ADMIN_RESET_PASSWORD/g, 'password reset through ADMIN_RESET_PASSWORD'],
  [/parolă resetată/g, 'password reset'], [/\brol: /g, 'role: '], [/\bnume\b/g, 'name'], [/grupuri/g, 'groups'],
  [/acces: toate prezentările/g, 'access: all presentations'], [/acces: doar grupurile alese/g, 'access: chosen groups only'],
  [/administrator inițial/g, 'initial administrator'], [/automat · eșuat: /g, 'automatic · failed: '], [/\bautomat\b/g, 'automatic'],
  [/copie de siguranță înainte/g, 'safety copy before'], [/cataloage: /g, 'catalogues: '], [/limbi: /g, 'languages: '], [/\btoate\b/g, 'all'],
  [/titlu/g, 'title'], [/catalog\b/g, 'catalogue'], [/limbă/g, 'language'], [/referință/g, 'reference'], [/adresă: /g, 'address: '],
  [/setări implicite prezentare/g, 'presentation defaults'], [/securitate/g, 'security'], [/notificări/g, 'notifications'],
  [/jurnal vizualizări/g, 'view logging'], [/acces: /g, 'access: '], [/link public/g, 'public link'],
];

// ------------------------------------------------------------------ language
const DICT = { ro: RO, en: EN };
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const cookieLang = (document.cookie.match(/(?:^|;\s*)pdfdeck_lang=(ro|en)/) || [])[1];
export let lang = stored('pdfdeck.lang') || cookieLang || ((navigator.language || 'ro').toLowerCase().startsWith('ro') ? 'ro' : 'en');
if (!DICT[lang]) lang = 'ro';
const writeCookie = () => { document.cookie = `pdfdeck_lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`; };
writeCookie();
document.documentElement.lang = lang;

export function t(key, vars) {
  let s = DICT[lang][key] ?? RO[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
export const locale = () => (lang === 'ro' ? 'ro-RO' : 'en-GB');
export const eventLabel = (type) => EVENTS[lang][type] || EVENTS.ro[type] || type;

export function issueText(g, refLang) {
  if (lang === 'ro' || !ISSUES_EN[g.code]) return { title: g.title, advice: g.advice };
  const [title, advice] = ISSUES_EN[g.code];
  return { title: title.replace('{ref}', refLang || ''), advice };
}
export function itemText(s) {
  if (lang === 'ro' || !s) return s;
  return ITEM_EN.reduce((acc, [re, to]) => acc.replace(re, to), String(s));
}
export function detailText(s) {
  if (lang === 'ro' || !s) return s;
  return DETAIL_EN.reduce((acc, [re, to]) => acc.replace(re, to), String(s));
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

export function setLang(l) {
  if (!DICT[l] || l === lang) return;
  lang = l;
  store('pdfdeck.lang', l);
  writeCookie();
  document.documentElement.lang = l;
  applyI18n();
  window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}

// ------------------------------------------------------------------ show / hide password (eye button)
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path stroke="currentColor" stroke-width="2" d="M3 3l18 18"/></svg>';
export function setPasswordVisible(input, visible) {
  input.type = visible ? 'text' : 'password';
  const b = document.querySelector(`.eye[data-eye-for="${input.id}"]`);
  if (!b) return;
  b.setAttribute('aria-pressed', String(visible));
  b.innerHTML = visible ? EYE_SHUT : EYE_OPEN;
  b.title = t(visible ? 'pw.hide' : 'pw.show');
  b.setAttribute('aria-label', b.title);
}
export function wireEyes(root = document) {
  root.querySelectorAll('.eye[data-eye-for]').forEach((b) => {
    const input = document.getElementById(b.dataset.eyeFor);
    if (!input || b.dataset.wired) return;
    b.dataset.wired = '1';
    setPasswordVisible(input, input.type === 'text');
    b.addEventListener('click', () => { setPasswordVisible(input, input.type === 'password'); input.focus(); });
  });
  window.addEventListener('langchange', () => root.querySelectorAll('.eye[data-eye-for]').forEach((b) => {
    const input = document.getElementById(b.dataset.eyeFor); if (input) setPasswordVisible(input, input.type === 'text');
  }));
}

// ------------------------------------------------------------------ theme
export let theme = stored('pdfdeck.theme') || 'auto';
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
applyTheme();
export function setTheme(v) {
  theme = ['light', 'dark', 'auto'].includes(v) ? v : 'auto';
  store('pdfdeck.theme', theme);
  applyTheme();
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

// Small RO|EN and Day|Night|Auto switches; `el` is the container.
export function mountSwitches(el) {
  const render = () => {
    el.innerHTML = `
      <div class="seg" role="group" aria-label="${t('lang.label')}">
        ${['ro', 'en'].map((l) => `<button type="button" data-lang="${l}" aria-pressed="${lang === l}">${l.toUpperCase()}</button>`).join('')}
      </div>
      <div class="seg" role="group" aria-label="${t('theme.label')}">
        ${[['light', '☀', 'theme.light'], ['dark', '☾', 'theme.dark'], ['auto', 'A', 'theme.auto']].map(([v, icon, key]) =>
          `<button type="button" data-theme-set="${v}" aria-pressed="${theme === v}" title="${t(key)}"><span aria-hidden="true">${icon}</span><span class="seg-label">${t(key)}</span></button>`).join('')}
      </div>`;
  };
  render();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lang) setLang(b.dataset.lang);
    if (b.dataset.themeSet) setTheme(b.dataset.themeSet);
    render();
  });
  window.addEventListener('langchange', render);
}
