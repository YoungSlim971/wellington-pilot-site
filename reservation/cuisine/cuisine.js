import {connecter, fermerSession, lireJour, sessionValide} from './agenda.js';

'use strict';
const el = id => document.getElementById(id);
const zone = 'America/Guadeloupe';
const formatJour = new Intl.DateTimeFormat('fr-FR',{timeZone:zone,dateStyle:'full'});
const formatHeure = new Intl.DateTimeFormat('fr-FR',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
const jourLocal = () => new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(new Date());
let service = 'all', donnees = null, requete = 0, enCours = false, dernierJourLocal = jourLocal();
const nomsServices = {midi:'Déjeuner', soir:'Dîner', journee:'Journée entière'};
function groupe(r) { return !r.debut ? 'journee' : r.debut < '17:00' ? 'midi' : 'soir'; }
function texte(tag, contenu, classe) {
  const node = document.createElement(tag);
  node.textContent = contenu;
  if (classe) node.className = classe;
  return node;
}
function notesLisibles(notes) {
  // Les descriptions Google peuvent contenir du HTML. L’arbre du template reste inerte.
  const template = document.createElement('template');
  template.innerHTML = notes.replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi,'\n');
  template.content.querySelectorAll('style,script').forEach(n => n.remove());
  return template.content.textContent.trim();
}
function fiche(r) {
  const item = document.createElement('details'), ligne = document.createElement('summary');
  if (r.statut === 'cancelled') item.className = 'annulee';
  const heure = texte('span',r.debut || 'Jour','horaire');
  if (r.fin) heure.append(texte('small',r.fin));
  const infos = document.createElement('span');
  infos.append(texte('span',r.nom,'nom'));
  const nb = r.couverts == null ? 'Couverts à préciser' : r.couverts + (r.couverts === 1 ? ' couvert' : ' couverts');
  const tables = r.tables.length ? (r.tables.length === 1 ? 'Table ' : 'Tables ') + r.tables.join(' + ') : 'Sans table';
  infos.append(texte('span',nb + ' · ' + tables,'placement'));
  const statut = {expected:'Attendue',arrived:'Arrivée',cancelled:'Annulée'}[r.statut];
  infos.append(texte('span',statut + (r.verifier ? ' · À vérifier' : ''),'etat'));
  const notes = notesLisibles(r.notes);
  if (notes) infos.append(texte('span',notes,'note'));
  const fleche = texte('span','›','fleche');
  fleche.setAttribute('aria-hidden','true');
  ligne.append(heure,infos,fleche);
  const detail = document.createElement('div');
  detail.className = 'detail';
  detail.append(texte('p','Téléphone · ' + (r.telephone || 'Non renseigné')));
  if (!notes) detail.append(texte('p','Aucune note.'));
  item.append(ligne,detail);
  return item;
}
function afficher() {
  if (donnees === null) return;
  const lignes = donnees.filter(r => service === 'all' || groupe(r) === service);
  const actives = lignes.filter(r => r.statut !== 'cancelled');
  const incomplet = actives.some(r => r.couverts == null);
  const total = actives.reduce((s,r) => s + (r.couverts || 0),0);
  el('couverts').textContent = incomplet ? (total ? total + ' + ?' : '?') : String(total);
  el('nombre').textContent = String(actives.length);
  el('message').textContent = !lignes.length ? 'Aucune réservation pour ' + (service === 'all' ? 'cette journée.' : 'ce service.') : '';
  el('contenu').replaceChildren();
  for (const [id,nom] of Object.entries(nomsServices)) {
    const groupeJour = lignes.filter(r => groupe(r) === id);
    if (!groupeJour.length) continue;
    const section = document.createElement('section'), liste = document.createElement('div');
    liste.className = 'liste';
    groupeJour.forEach(r => liste.append(fiche(r)));
    section.append(texte('h2',nom),liste);
    el('contenu').append(section);
  }
}
function vider() {
  donnees = null;
  el('couverts').textContent = el('nombre').textContent = '—';
  el('contenu').replaceChildren();
  el('sync').textContent = '';
}
function verrouiller(message) {
  ++requete;
  enCours = false;
  fermerSession();
  vider();
  el('service').hidden = el('navigation').hidden = true;
  el('connexion').hidden = false;
  el('avis').textContent = message;
  el('connecter').disabled = false;
}
el('connecter').onclick = async () => {
  el('connecter').disabled = true;
  el('avis').textContent = 'Choisis le compte Wellington dans la fenêtre Google.';
  try {
    await connecter();
    el('connexion').hidden = true;
    el('service').hidden = el('navigation').hidden = false;
    el('connecter').disabled = false;
    charger(true);
  } catch (error) { verrouiller(error.message); }
};
el('quitter').onclick = () => verrouiller('Session cuisine fermée. Tu peux te reconnecter avec le compte Wellington.');
async function charger(nouvelleDate) {
  const jour = el('jour').value;
  if (!jour || el('service').hidden) return;
  if (!sessionValide()) {
    verrouiller('Ta session a expiré. Reconnecte-toi pour actualiser les réservations.');
    return;
  }
  const tour = ++requete;
  enCours = true;
  if (nouvelleDate) vider();
  el('jourLong').textContent = formatJour.format(new Date(jour + 'T12:00:00-04:00'));
  if (donnees === null) el('message').textContent = 'Lecture de l’agenda…';
  el('actualiser').disabled = true;
  try {
    const resultat = await lireJour(jour);
    if (tour !== requete) return;
    donnees = resultat;
    afficher();
    el('sync').textContent = 'Mis à jour à ' + formatHeure.format(new Date());
  } catch (error) {
    if (tour !== requete) return;
    if (error.status === 401 || error.status === 403) {
      verrouiller('Google a refusé la lecture. Reconnecte le compte Wellington et autorise les deux accès en lecture.');
      return;
    }
    vider();
    el('message').textContent = 'Les réservations n’ont pas pu être chargées. Vérifie la connexion puis touche Actualiser.';
  } finally {
    if (tour === requete) { enCours = false; el('actualiser').disabled = false; }
  }
}
function decaler(n) {
  const d = new Date(el('jour').value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  el('jour').value = d.toISOString().slice(0,10);
  charger(true);
}
el('jour').value = dernierJourLocal;
el('jour').onchange = () => { if (!el('jour').value) el('jour').value = jourLocal(); charger(true); };
el('avant').onclick = () => decaler(-1);
el('apres').onclick = () => decaler(1);
el('actualiser').onclick = () => charger(false);
document.querySelectorAll('[data-service]').forEach(b => b.onclick = () => {
  service = b.dataset.service;
  for (const bouton of document.querySelectorAll('[data-service]')) bouton.setAttribute('aria-pressed',String(bouton === b));
  afficher();
});
function actualisationAuto() {
  if (document.hidden || enCours || el('service').hidden) return;
  const aujourdhui = jourLocal(), suivre = el('jour').value === dernierJourLocal && aujourdhui !== dernierJourLocal;
  dernierJourLocal = aujourdhui;
  if (suivre) el('jour').value = aujourdhui;
  charger(suivre);
}
document.addEventListener('visibilitychange',actualisationAuto);
setInterval(actualisationAuto,120000);
el('jourLong').textContent = formatJour.format(new Date());
window.addEventListener('pageshow', e => { if (e.persisted) verrouiller('Reconnecte le compte Wellington pour consulter les réservations.'); });
