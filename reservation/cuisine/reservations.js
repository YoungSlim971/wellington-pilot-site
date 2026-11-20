const timeZone = 'America/Guadeloupe';
const dateLocale = new Intl.DateTimeFormat('sv-SE', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
const heureLocale = new Intl.DateTimeFormat('fr-FR', {timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

function lireBloc_(description) {
  const marqueur = '[WELLINGTON_RESERVATION_';
  if (!description.includes(marqueur)) return {notes: description, meta: null, invalide: false};
  const bloc = /\[WELLINGTON_RESERVATION_V([12])\]([\s\S]*?)\[\/WELLINGTON_RESERVATION_V\1\]/.exec(description);
  if (bloc) {
    const notes = description.replace(bloc[0], '').trim();
    try {
      const m = JSON.parse(bloc[2]);
      const tables = m.tableNames;
      const multi = Array.isArray(tables) && tables.length >= 2 && tables[0] === m.tableName &&
        tables.every(n => typeof n === 'string' && n.trim() && n.trim() === n) &&
        new Set(tables.map(n => n.toLowerCase())).size === tables.length;
      if (!notes.includes(marqueur) && m.version === Number(bloc[1]) &&
          /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(m.id) &&
          typeof m.name === 'string' && typeof m.title === 'string' && typeof m.phone === 'string' &&
          Number.isFinite(m.updatedAt) && Number.isInteger(m.guests) && m.guests >= 1 && m.guests <= 100 &&
          ['expected', 'arrived', 'cancelled'].includes(m.status) &&
          (m.tableName == null || typeof m.tableName === 'string') &&
          (m.version === 1 ? tables == null : multi)) return {notes, meta: m, invalide: false};
    } catch (_) { /* Un ancien bloc illisible ne doit pas masquer la fiche. */ }
  }
  return {notes: description.split(marqueur)[0].trim(), meta: null, invalide: true};
}

export function reservation(e, jour) {
  const titre = e.summary || 'Sans titre';
  if (e.status === 'cancelled' || titre === 'Wellington · état des tables' ||
      (e.eventType && e.eventType !== 'default') || !e.start) return null;
  const debut = e.start.dateTime && new Date(e.start.dateTime);
  const jourLocal = debut ? dateLocale.format(debut) : e.start.date;
  if (jourLocal !== jour) return null;
  const bloc = lireBloc_(e.description || '');
  const m = bloc.meta;
  const titreChange = m && m.title !== titre;
  const annule = /^\[Annulée\]\s*/i.test(titre);
  const intitule = titre.replace(/^\[Annulée\]\s*/i, '');
  const champs = /^(.+?)\s*[·—-]\s*(\d{1,3})\s*(?:couverts?|personnes?|pers\.?)(?:\s*·.*)?$/i.exec(intitule);
  const nombre = champs && Number(champs[2]);
  const tables = m ? (m.tableNames || (m.tableName ? [m.tableName] : [])) : [];
  return {
    nom: (m && !titreChange ? m.name : champs ? champs[1] : intitule) || 'Nom à compléter',
    couverts: m && !titreChange ? m.guests : nombre >= 1 && nombre <= 100 ? nombre : null,
    debut: debut ? heureLocale.format(debut) : '',
    fin: e.end && e.end.dateTime ? heureLocale.format(new Date(e.end.dateTime)) : '',
    tables, telephone: m ? m.phone : '', notes: bloc.notes,
    statut: annule ? 'cancelled' : m ? m.status : 'expected',
    verifier: Boolean(titreChange || bloc.invalide)
  };
}
