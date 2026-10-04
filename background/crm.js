// Logique métier : recherche, badges, capture d'un profil dans Attio.
import '../shared/constants.js';
import '../shared/url.js';
import '../shared/location.js';
import { attio, AttioError, getSettings } from './attio-client.js';
import { cacheGet, cacheSet, cacheClear } from './cache.js';

const { REQUIRED_SCOPES } = globalThis.AttioConst;
const { extractHandle, normalizeProfileUrl } = globalThis.AttioUrl;
const { toAttioLocation, formatAttioLocation } = globalThis.AttioLocation;

// ---------------------------------------------------------------------------
// Lecture des valeurs Attio
// ---------------------------------------------------------------------------

const first = (record, slug) => (record.values && record.values[slug] && record.values[slug][0]) || null;
const textOf = (record, slug) => {
  const v = first(record, slug);
  return v && typeof v.value === 'string' ? v.value : '';
};
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Cache mémoire des noms d'entreprise (durée de vie du service worker).
const companyNames = new Map();

async function companyName(companyId) {
  if (!companyId) return '';
  if (companyNames.has(companyId)) return companyNames.get(companyId);
  try {
    const res = await attio('GET', `/objects/companies/records/${companyId}`);
    const name = textOf(res.data, 'name');
    companyNames.set(companyId, name);
    return name;
  } catch (e) {
    if (e.code === 'NOT_FOUND') return '';
    throw e;
  }
}

async function summarize(record, settings) {
  const name = first(record, 'name');
  const loc = first(record, 'primary_location');
  const company = first(record, 'company');
  const type = first(record, settings.contactTypeSlug);
  const companyId = company ? company.target_record_id : null;
  return {
    recordId: record.id.record_id,
    webUrl: record.web_url,
    createdAt: record.created_at,
    fullName: name ? name.full_name : '',
    jobTitle: textOf(record, 'job_title'),
    companyId,
    companyName: await companyName(companyId),
    location: formatAttioLocation(loc),
    locationParts: loc ? { locality: loc.locality, region: loc.region, country_code: loc.country_code } : null,
    linkedin: textOf(record, 'linkedin'),
    salesnavId: textOf(record, settings.salesnavIdSlug),
    contactType: type && type.option ? type.option.title : ''
  };
}

// ---------------------------------------------------------------------------
// Attributs personnalisés (contact_type, salesnav_id)
// ---------------------------------------------------------------------------

let attrCache = null; // { at, slugs, status }

async function getAttribute(slug) {
  try {
    const res = await attio('GET', `/objects/people/attributes/${encodeURIComponent(slug)}`);
    return res.data;
  } catch (e) {
    if (e.code === 'NOT_FOUND') return null;
    throw e;
  }
}

export async function attributeStatus(settings, { force = false } = {}) {
  const slugs = settings.contactTypeSlug + '|' + settings.salesnavIdSlug;
  if (!force && attrCache && attrCache.slugs === slugs && Date.now() - attrCache.at < 5 * 60 * 1000) {
    return attrCache.status;
  }
  const [ct, sn] = await Promise.all([getAttribute(settings.contactTypeSlug), getAttribute(settings.salesnavIdSlug)]);

  const contactType = { slug: settings.contactTypeSlug, exists: !!ct, ok: false, options: [], multiselect: false, problem: '' };
  if (!ct) {
    contactType.problem = `L'attribut « ${settings.contactTypeSlug} » n'existe pas sur l'objet People. ` +
      `Crée-le dans Attio : Settings → Objects → People → Attributes → + Create attribute, type « Select », ` +
      `slug « ${settings.contactTypeSlug} », avec les options de ton choix.`;
  } else if (ct.type !== 'select') {
    contactType.problem = `L'attribut « ${settings.contactTypeSlug} » existe mais il est de type « ${ct.type} » au lieu de « select ».`;
  } else {
    const opts = await attio('GET', `/objects/people/attributes/${encodeURIComponent(settings.contactTypeSlug)}/options`);
    contactType.options = (opts.data || []).filter((o) => !o.is_archived).map((o) => o.title);
    contactType.multiselect = !!ct.is_multiselect;
    contactType.ok = true;
  }

  const salesnavId = { slug: settings.salesnavIdSlug, exists: !!sn, ok: false, problem: '' };
  if (!sn) {
    salesnavId.problem = `L'attribut « ${settings.salesnavIdSlug} » n'existe pas : l'identifiant Sales Navigator ne sera pas enregistré. ` +
      `Crée-le dans Attio (People → attribut de type « Text », slug « ${settings.salesnavIdSlug} »).`;
  } else if (sn.type !== 'text') {
    salesnavId.problem = `L'attribut « ${settings.salesnavIdSlug} » doit être de type « text » (actuellement « ${sn.type} »).`;
  } else {
    salesnavId.ok = true;
  }

  const status = { contactType, salesnavId };
  attrCache = { at: Date.now(), slugs, status };
  return status;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export async function testConnection(token) {
  const self = await attio('GET', '/self', null, { token });
  if (!self || !self.active) {
    // /v2/self renvoie 200 + {active:false} pour un token inconnu ou révoqué.
    throw new AttioError('INVALID_TOKEN', 'Token Attio invalide ou révoqué.');
  }
  const scopes = String(self.scope || '').split(/\s+/);
  const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  const settings = { ...(await getSettings()), token };
  let attributes = null;
  if (!missingScopes.includes('object_configuration:read')) {
    attrCache = null;
    await chrome.storage.local.set({ settings }); // pour que attio() utilise ce token
    attributes = await attributeStatus(settings, { force: true });
  }
  return {
    workspaceName: self.workspace_name,
    workspaceSlug: self.workspace_slug,
    tokenLevel: self.token_level,
    missingScopes,
    attributes
  };
}

// ---------------------------------------------------------------------------
// Recherche de personnes
// ---------------------------------------------------------------------------

async function queryPeople(filter, limit = 500) {
  const res = await attio('POST', '/objects/people/records/query', { filter, limit });
  return res.data || [];
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// $contains est insensible à la casse et tolère les variantes stockées
// (sans www, slash final…). On revérifie le handle exact ensuite.
async function findByHandles(handles) {
  const found = {};
  for (const group of chunk(handles, 25)) {
    const filter = group.length === 1
      ? { linkedin: { $contains: '/in/' + group[0] } }
      : { $or: group.map((h) => ({ linkedin: { $contains: '/in/' + h } })) };
    for (const rec of await queryPeople(filter)) {
      const h = extractHandle(textOf(rec, 'linkedin'));
      if (h && group.includes(h) && !found[h]) found[h] = rec;
    }
  }
  return found;
}

async function findBySalesNavIds(ids, slug) {
  const found = {};
  for (const group of chunk(ids, 25)) {
    const filter = group.length === 1
      ? { [slug]: { $eq: group[0] } }
      : { $or: group.map((id) => ({ [slug]: { $eq: id } })) };
    for (const rec of await queryPeople(filter)) {
      const id = textOf(rec, slug);
      if (id && !found[id]) found[id] = rec;
    }
  }
  return found;
}

async function findByNames(names) {
  const found = {}; // norm(name) -> [records]
  for (const group of chunk(names, 25)) {
    const filter = group.length === 1
      ? { name: { full_name: { $eq: group[0] } } }
      : { $or: group.map((n) => ({ name: { full_name: { $eq: n } } })) };
    for (const rec of await queryPeople(filter)) {
      const n = first(rec, 'name');
      if (!n) continue;
      const k = norm(n.full_name);
      (found[k] = found[k] || []).push(rec);
    }
  }
  return found;
}

function sameCompany(a, b) {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

// ---------------------------------------------------------------------------
// Badges (lots de résultats visibles)
// ---------------------------------------------------------------------------

function badgeFrom(rec, status) {
  return { status, createdAt: rec.created_at, webUrl: rec.web_url, fullName: (first(rec, 'name') || {}).full_name || '' };
}

// items : [{ key, handle?, salesnavId?, name?, company? }]
// Retour : { [key]: { status: 'found'|'probable'|'homonym'|'absent', createdAt?, webUrl?, fullName? } }
export async function lookupBatch(items) {
  const settings = await getSettings();
  const cacheKeyOf = (it) =>
    it.handle ? 'h:' + it.handle
      : it.salesnavId ? 's:' + it.salesnavId + '|' + norm(it.company)
        : 'n:' + norm(it.name) + '|' + norm(it.company);

  const keys = [...new Set(items.map(cacheKeyOf))];
  const cached = await cacheGet(keys);
  const pending = items.filter((it) => !(cacheKeyOf(it) in cached));
  const fresh = {};

  if (pending.length) {
    // 1. Profils LinkedIn : correspondance exacte sur l'URL.
    const handles = [...new Set(pending.filter((i) => i.handle).map((i) => i.handle))];
    const byHandle = handles.length ? await findByHandles(handles) : {};
    for (const it of pending.filter((i) => i.handle)) {
      const rec = byHandle[it.handle];
      fresh[cacheKeyOf(it)] = rec ? badgeFrom(rec, 'found') : { status: 'absent' };
    }

    // 2. Sales Navigator : identifiant exact, puis nom (+ entreprise).
    const others = pending.filter((i) => !i.handle);
    let bySn = {};
    const snIds = [...new Set(others.filter((i) => i.salesnavId).map((i) => i.salesnavId))];
    if (snIds.length) {
      const attrs = await attributeStatus(settings);
      if (attrs.salesnavId.ok) bySn = await findBySalesNavIds(snIds, settings.salesnavIdSlug);
    }
    const needName = [];
    for (const it of others) {
      const rec = it.salesnavId && bySn[it.salesnavId];
      if (rec) fresh[cacheKeyOf(it)] = badgeFrom(rec, 'found');
      else if (it.name) needName.push(it);
      else fresh[cacheKeyOf(it)] = { status: 'absent' };
    }

    if (needName.length) {
      const byName = await findByNames([...new Set(needName.map((i) => i.name))]);
      for (const it of needName) {
        const recs = byName[norm(it.name)] || [];
        if (!recs.length) {
          fresh[cacheKeyOf(it)] = { status: 'absent' };
          continue;
        }
        let match = null;
        if (it.company) {
          for (const rec of recs) {
            const c = first(rec, 'company');
            if (c && sameCompany(await companyName(c.target_record_id), it.company)) { match = rec; break; }
          }
        }
        fresh[cacheKeyOf(it)] = match ? badgeFrom(match, 'probable') : badgeFrom(recs[0], 'homonym');
      }
    }
    await cacheSet(fresh);
  }

  const out = {};
  for (const it of items) out[it.key] = cached[cacheKeyOf(it)] || fresh[cacheKeyOf(it)];
  return out;
}

// ---------------------------------------------------------------------------
// Popup : état d'un profil avant capture
// ---------------------------------------------------------------------------

async function findExisting({ linkedinUrl, salesnavId }, settings, attrs) {
  const handle = extractHandle(linkedinUrl);
  if (handle) {
    const rec = (await findByHandles([handle]))[handle];
    if (rec) return rec;
  }
  if (salesnavId && attrs.salesnavId.ok) {
    const rec = (await findBySalesNavIds([salesnavId], settings.salesnavIdSlug))[salesnavId];
    if (rec) return rec;
  }
  return null;
}

export async function lookupProfile(profile) {
  const settings = await getSettings();
  const attrs = await attributeStatus(settings);
  const rec = await findExisting(profile, settings, attrs);
  let homonyms = [];
  if (!rec && profile.fullName) {
    const recs = (await findByNames([profile.fullName]))[norm(profile.fullName)] || [];
    homonyms = await Promise.all(recs.slice(0, 3).map((r) => summarize(r, settings)));
  }
  return {
    existing: rec ? await summarize(rec, settings) : null,
    homonyms,
    attributes: attrs,
    contactTypes: attrs.contactType.ok ? attrs.contactType.options : []
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

// Rattachement d'une entreprise, du plus fiable au moins fiable :
// 1. URL LinkedIn de l'entreprise (attribut standard `linkedin` des Companies) ;
// 2. nom exact, puis on complète son URL LinkedIn si elle est vide ;
// 3. création avec le nom et l'URL.
async function findOrCreateCompany(name, linkedinUrl) {
  const clean = name.trim();
  const slug = globalThis.AttioUrl.extractCompanySlug(linkedinUrl);
  const url = slug ? 'https://www.linkedin.com/company/' + slug : null;

  if (slug) {
    const res = await attio('POST', '/objects/companies/records/query', {
      filter: { linkedin: { $contains: '/company/' + slug } }, limit: 10
    });
    const match = (res.data || []).find((c) => globalThis.AttioUrl.extractCompanySlug(textOf(c, 'linkedin')) === slug);
    if (match) return match.id.record_id;
  }

  const byName = await attio('POST', '/objects/companies/records/query', { filter: { name: { $eq: clean } }, limit: 1 });
  if (byName.data && byName.data.length) {
    const company = byName.data[0];
    if (url && !textOf(company, 'linkedin')) {
      await attio('PATCH', `/objects/companies/records/${company.id.record_id}`, { data: { values: { linkedin: url } } });
    }
    return company.id.record_id;
  }

  const values = { name: clean };
  if (url) values.linkedin = url;
  const created = await attio('POST', '/objects/companies/records', { data: { values } });
  companyNames.set(created.data.id.record_id, clean);
  return created.data.id.record_id;
}

function formatDateFr(iso) {
  return new Date(iso || Date.now()).toLocaleDateString('fr-FR');
}

// payload : { profile: {firstName, lastName, jobTitle, company, location, linkedinUrl, salesnavId},
//             contactType, note, replace: {jobTitle, company, location} }
export async function captureProfile(payload) {
  const settings = await getSettings();
  const attrs = await attributeStatus(settings, { force: true });
  const p = payload.profile || {};
  const replace = payload.replace || {};
  const warnings = [];
  const linkedinUrl = normalizeProfileUrl(p.linkedinUrl);
  const firstName = (p.firstName || '').trim();
  const lastName = (p.lastName || '').trim();

  if (!linkedinUrl && !p.salesnavId) {
    throw new AttioError('VALIDATION', "Aucune URL LinkedIn ni identifiant Sales Navigator : impossible d'éviter un doublon.");
  }

  const rec = await findExisting({ linkedinUrl, salesnavId: p.salesnavId }, settings, attrs);
  const existing = rec ? await summarize(rec, settings) : null;
  const values = {};
  const changed = [];

  // Règle : sur une fiche existante, on ne remplit que les champs vides,
  // sauf si l'utilisateur a coché « Remplacer ». Le nom n'est jamais modifié.
  const shouldWrite = (field, newVal, currentVal) =>
    !!newVal && (!existing || !currentVal || (replace[field] && norm(newVal) !== norm(currentVal)));

  if (!existing) {
    if (!firstName && !lastName) throw new AttioError('VALIDATION', 'Le nom est obligatoire pour créer une fiche.');
    values.name = { first_name: firstName, last_name: lastName, full_name: [firstName, lastName].filter(Boolean).join(' ') };
  }

  if (shouldWrite('jobTitle', p.jobTitle, existing && existing.jobTitle)) {
    values.job_title = p.jobTitle.trim();
    changed.push('titre');
  }

  if (shouldWrite('company', p.company, existing && existing.companyName)) {
    const companyId = await findOrCreateCompany(p.company, p.companyLinkedinUrl);
    values.company = { target_object: 'companies', target_record_id: companyId };
    changed.push('entreprise');
  }

  if (shouldWrite('location', p.location, existing && existing.location)) {
    values.primary_location = toAttioLocation(p.location);
    changed.push('localisation');
  }

  if (linkedinUrl && (!existing || !existing.linkedin)) {
    values.linkedin = linkedinUrl;
    changed.push('URL LinkedIn');
  }

  if (p.salesnavId) {
    if (!attrs.salesnavId.ok) warnings.push(attrs.salesnavId.problem);
    else if (!existing || !existing.salesnavId) {
      values[settings.salesnavIdSlug] = p.salesnavId;
      changed.push('ID Sales Navigator');
    }
  }

  // Le type est un choix explicite de l'utilisateur dans le popup (pré-rempli avec la valeur Attio).
  if (payload.contactType) {
    const ct = attrs.contactType;
    if (!ct.ok) {
      warnings.push(ct.problem);
    } else if (!ct.options.includes(payload.contactType)) {
      warnings.push(`L'option « ${payload.contactType} » n'existe pas dans l'attribut « ${ct.slug} ». ` +
        `Ajoute-la dans Attio (Settings → Objects → People → ${ct.slug} → options).`);
    } else if (!existing || existing.contactType !== payload.contactType) {
      values[settings.contactTypeSlug] = ct.multiselect ? [payload.contactType] : payload.contactType;
      changed.push('type de contact');
    }
  }

  let record;
  let action;
  if (!existing) {
    record = (await attio('POST', '/objects/people/records', { data: { values } })).data;
    action = 'created';
  } else if (Object.keys(values).length) {
    // PATCH : ajoute aux multiselect sans écraser les valeurs existantes.
    record = (await attio('PATCH', `/objects/people/records/${existing.recordId}`, { data: { values } })).data;
    action = 'updated';
  } else {
    record = rec;
    action = 'unchanged';
  }

  const recordId = record.id.record_id;
  const note = (payload.note || '').trim();
  if (note) {
    try {
      await attio('POST', '/notes', {
        data: {
          parent_object: 'people',
          parent_record_id: recordId,
          title: `Note LinkedIn du ${formatDateFr()}`,
          format: 'plaintext',
          content: note
        }
      });
    } catch (e) {
      warnings.push(e.code === 'FORBIDDEN'
        ? "La note n'a pas été ajoutée : le token n'a pas le scope note:read-write."
        : "La note n'a pas été ajoutée : " + e.message);
    }
  }

  // On vide le cache des badges pour que la page reflète l'ajout tout de suite.
  await cacheClear();

  return { action, changed, warnings, webUrl: record.web_url, createdAt: record.created_at };
}
