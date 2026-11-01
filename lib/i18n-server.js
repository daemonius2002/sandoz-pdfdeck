// Server messages are written in Romanian; when the interface is in English
// (cookie pdfdeck_lang=en) the `error` / `message` fields are translated on the way out.
const EXACT = {
  'Adresa este deja folosită.': 'This address is already in use.',
  'Alege fișierul de backup (.zip).': 'Choose the backup file (.zip).',
  'Alege un fișier PDF.': 'Choose a PDF file.',
  'Backup-ul nu există.': 'This backup does not exist.',
  'Cerere respinsă.': 'Request rejected.',
  'Eroare de server': 'Server error',
  'Grupul nu există.': 'This group does not exist.',
  'Nu ai drepturi pentru această acțiune.': 'You do not have permission for this action.',
  'Nu există': 'Not found',
  'Sesiunea nu mai există.': 'This session no longer exists.',
  'Arhiva conține căi nepermise.': 'The archive contains forbidden paths.',
  'Arhiva nu este un backup al platformei (lipsește backup.json).': 'The archive is not a backup of this platform (backup.json is missing).',
  'Arhiva nu este un backup al platformei.': 'The archive is not a backup of this platform.',
  'Backup-ul nu are niciun administrator activ, deci nu ai mai putea intra.': 'The backup has no active administrator, so you could no longer sign in.',
  'Backup-ul nu conține utilizatorii.': 'The backup does not contain the users.',
  'Există deja un utilizator cu acest nume.': 'A user with this name already exists.',
  'Fișierul nu este o arhivă ZIP validă.': 'The file is not a valid ZIP archive.',
  'Fișierul nu pare a fi un PDF.': 'The file does not look like a PDF.',
  'Grupul trebuie să aibă un nume.': 'The group needs a name.',
  'Nu există destinatari pentru notificări.': 'There are no notification recipients.',
  'Nu îți poți dezactiva propriul cont.': 'You cannot disable your own account.',
  'Nu îți poți schimba propriul rol.': 'You cannot change your own role.',
  'Nu îți poți șterge propriul cont.': 'You cannot delete your own account.',
  'Nume de backup invalid.': 'Invalid backup name.',
  'Numele de utilizator: 3–40 caractere, doar litere (fără diacritice), cifre, punct, minus sau underscore.': 'Username: 3–40 characters, only letters (no accents), digits, dot, minus or underscore.',
  'Parola actuală nu este corectă.': 'The current password is not correct.',
  'Parola nouă trebuie să fie diferită de cea actuală.': 'The new password must differ from the current one.',
  'Rol necunoscut.': 'Unknown role.',
  'Serverul de email nu este configurat (variabilele SMTP_HOST și SMTP_FROM).': 'The mail server is not configured (SMTP_HOST and SMTP_FROM variables).',
  'Trebuie să rămână cel puțin un administrator activ.': 'At least one active administrator must remain.',
  'Utilizatorul nu există.': 'This user does not exist.',
  'Contul este dezactivat. Contactează administratorul.': 'This account is disabled. Contact the administrator.',
  'Prea multe încercări greșite. Contul este blocat temporar.': 'Too many wrong attempts. The account is temporarily locked.',
  'Utilizator sau parolă greșită.': 'Wrong username or password.',
  'Schimbă parola înainte de a continua.': 'Change your password before continuing.',
  'Parola trebuie să aibă cel puțin 10 caractere.': 'The password needs at least 10 characters.',
  'Parola este prea lungă.': 'The password is too long.',
  'Parola trebuie să conțină litere și cifre.': 'The password needs both letters and digits.',
  'Prezentarea nu există.': 'This presentation does not exist.',
  'Scrie parola actuală.': 'Enter your current password.',
};
const PREFIX = [
  [/^Backup-ul nu a reușit: /, 'The backup failed: '],
  [/^Emailul nu a putut fi trimis: /, 'The email could not be sent: '],
  [/^Nu am putut citi PDF-ul: /, 'Could not read the PDF: '],
  [/^PDF-ul depășește (\d+) MB\.$/, 'The PDF is larger than $1 MB.'],
  [/^Prea multe încercări greșite\. Încearcă din nou după (.+)\.$/, 'Too many wrong attempts. Try again after $1.'],
  [/^Parola nouă trebuie să aibă: /, 'The new password needs: '],
  [/cel puțin 8 caractere/, 'at least 8 characters'], [/o literă mică/, 'a lowercase letter'],
  [/o literă mare/, 'a capital letter'], [/un caracter special \(de ex\. /, 'a special character (e.g. '],
];

export function toEnglish(msg) {
  if (typeof msg !== 'string') return msg;
  if (EXACT[msg]) return EXACT[msg];
  let out = msg;
  for (const [re, to] of PREFIX) out = out.replace(re, to);
  // the tail of a prefixed message can itself be a known message
  for (const [ro, en] of Object.entries(EXACT)) if (out.endsWith(ro)) out = out.slice(0, -ro.length) + en;
  return out;
}

export const langOf = (req) => ((req.headers.cookie || '').match(/(?:^|;\s*)pdfdeck_lang=(ro|en)/) || [])[1] || 'ro';

// Express middleware
export function translateResponses(req, res, next) {
  if (langOf(req) !== 'en') return next();
  req.lang = 'en';
  const json = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (typeof body.error === 'string' && !['auth', 'password_change', 'not found'].includes(body.error)) body = { ...body, error: toEnglish(body.error) };
      if (typeof body.message === 'string') body = { ...body, message: toEnglish(body.message) };
    }
    return json(body);
  };
  next();
}
