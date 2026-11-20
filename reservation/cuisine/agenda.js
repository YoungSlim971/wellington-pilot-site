import {reservation} from './reservations.js';

// Identifiant public Google Identity Services. Aucun secret client dans le navigateur.
const CLIENT = '210693873600-nrlsi2gb1q5n09k7rqm52hnpb5a9hsec.apps.googleusercontent.com';
const AGENDA_WELLINGTON = 'd675ab49acd81f67461531e191646ba1dc1049dcb03fb71bb18997193e6b9a97';
const RACINE = 'https://www.googleapis.com/calendar/v3/';
const PERMISSIONS = ['calendar.calendarlist.readonly','calendar.events.readonly']
  .map(scope => 'https://www.googleapis.com/auth/' + scope);
let session = null;

export function fermerSession() { session = null; }
export function sessionValide() { return !!session && Date.now() < session.expiration; }

function demanderAcces() {
  return new Promise((resolve,reject) => {
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth) {
      reject(new Error('Le module Google ne s’est pas chargé. Recharge la page ou ouvre-la dans Safari ou Chrome.'));
      return;
    }
    const client = oauth.initTokenClient({
      client_id: CLIENT, scope: PERMISSIONS.join(' '), include_granted_scopes: false, prompt:'select_account',
      callback: r => {
        if (r.error || !r.access_token || !oauth.hasGrantedAllScopes(r,...PERMISSIONS)) {
          reject(new Error('La connexion demande les deux autorisations de lecture Google Agenda.'));
        } else { resolve(r); }
      },
      error_callback: e => reject(new Error(e.type === 'popup_failed_to_open'
        ? 'Autorise la fenêtre de connexion Google ou ouvre ce lien directement dans Safari ou Chrome.'
        : 'La connexion Google a été interrompue. Tu peux réessayer.'))
    });
    client.requestAccessToken();
  });
}

async function lecture(chemin, params, jeton) {
  const url = new URL(chemin,RACINE);
  url.search = new URLSearchParams(params);
  const reponse = await fetch(url, {headers:{Authorization:'Bearer ' + jeton},cache:'no-store',
    credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
  if (!reponse.ok) {
    const erreur = new Error('Google Agenda ne permet pas la lecture pour ce compte.');
    erreur.status = reponse.status;
    throw erreur;
  }
  return reponse.json();
}

export async function connecter() {
  fermerSession();
  const r = await demanderAcces();
  const agenda = await lecture('users/me/calendarList/primary',{fields:'id,primary,accessRole'},r.access_token);
  const octets = new TextEncoder().encode((agenda.id || '').trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256',octets);
  const empreinte = Array.from(new Uint8Array(hash),v => v.toString(16).padStart(2,'0')).join('');
  if (!agenda.primary || agenda.accessRole !== 'owner' || empreinte !== AGENDA_WELLINGTON) {
    throw new Error('Ce compte ne correspond pas au restaurant. Choisis le compte Google Wellington.');
  }
  session = {jeton:r.access_token,expiration:Date.now() + Number(r.expires_in) * 1000 - 10000};
}

export async function lireJour(jour) {
  if (!sessionValide()) throw Object.assign(new Error('Session expirée.'),{status:401});
  const debut = new Date(jour + 'T00:00:00-04:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !Number.isFinite(debut.getTime()) ||
      debut.toISOString().slice(0,10) !== jour) throw new Error('Date invalide.');
  const jeton = session.jeton;
  const params = {timeMin:debut.toISOString(),timeMax:new Date(debut.getTime()+86400000).toISOString(),
    timeZone:'America/Guadeloupe',singleEvents:'true',orderBy:'startTime',showDeleted:'false',
    fields:'nextPageToken,items(summary,description,status,start,end,eventType)'};
  const fiches = [];
  do {
    const page = await lecture('calendars/primary/events',params,jeton);
    for (const e of page.items || []) {
      const fiche = reservation(e,jour);
      if (fiche) fiches.push(fiche);
    }
    params.pageToken = page.nextPageToken;
  } while (params.pageToken);
  return fiches;
}
