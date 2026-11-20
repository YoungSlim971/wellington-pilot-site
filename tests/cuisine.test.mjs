import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {connecter,fermerSession,lireJour,sessionValide} from '../reservation/cuisine/agenda.js';
import {reservation} from '../reservation/cuisine/reservations.js';

const jour = '2026-11-20';
test('un compte différent est refusé avant la première requête d’événements',async t => {
  const urls=[];
  t.mock.method(globalThis,'fetch',async (url, options) => {
    urls.push(url.pathname);
    assert.equal(options.cache,'no-store');
    return Response.json({id:'personnel@example.invalid',primary:true,accessRole:'owner'});
  });
  const oauth2 = {initTokenClient(opts) {
    assert.equal(opts.include_granted_scopes,false);
    assert.ok(opts.scope.split(' ').every(s => s.endsWith('.readonly')));
    return {requestAccessToken:()=>opts.callback({access_token:'fictif',expires_in:3600})};
  },hasGrantedAllScopes:()=>true};
  globalThis.window={google:{accounts:{oauth2}}};
  try {
    await assert.rejects(connecter(),/compte ne correspond pas/);
    assert.equal(sessionValide(),false);
    await assert.rejects(lireJour(jour),/Session expirée/);
    assert.deepEqual(urls,['/calendar/v3/users/me/calendarList/primary']);
  } finally {fermerSession();delete globalThis.window;}
});
test('le lien du chef charge la page de connexion avant toute lecture',()=> {
  const html=readFileSync(new URL('../reservation/cuisine/index.html',import.meta.url),'utf8');
  assert.match(html,/id="connecter"/);assert.match(html,/id="service" hidden/);
  assert.doesNotMatch(html,/script\.google\.com|google\.script\.run/);
});
test('les fiches reprennent les horaires locaux, couverts et annulations',()=> {
  const e={summary:'Essai · 2 couverts',start:{dateTime:'2026-11-21T00:00:00Z'},end:{dateTime:'2026-11-21T01:00:00Z'}};
  const r=reservation(e,jour);assert.equal(r.debut,'20:00');assert.equal(r.couverts,2);
  assert.equal(reservation({...e,summary:'[Annulée] Essai · 2 couverts'},jour).statut,'cancelled');
  assert.equal(reservation({...e,summary:'Wellington · état des tables'},jour),null);
});
