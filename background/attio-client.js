// Client HTTP Attio v2 : auth, erreurs normalisées, gestion du 429.
import '../shared/constants.js';

const { API_BASE } = globalThis.AttioConst;

export class AttioError extends Error {
  // code : NO_TOKEN | INVALID_TOKEN | FORBIDDEN | NOT_FOUND | RATE_LIMIT | VALIDATION | NETWORK | API
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
  toJSON() {
    return { code: this.code, message: this.message, details: this.details || null };
  }
}

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...globalThis.AttioConst.DEFAULT_SETTINGS, ...(settings || {}) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry-After est une date HTTP (ex. "Tue, 23 May 2023 14:42:01 GMT").
function retryDelayMs(res) {
  const h = res.headers.get('Retry-After');
  if (!h) return 1000;
  const asNumber = Number(h);
  if (!Number.isNaN(asNumber)) return asNumber * 1000;
  const at = Date.parse(h);
  return Number.isNaN(at) ? 1000 : Math.max(0, at - Date.now());
}

export async function attio(method, path, body, { token, retries = 2 } = {}) {
  if (!token) token = (await getSettings()).token;
  if (!token) {
    throw new AttioError('NO_TOKEN', "Aucun token Attio configuré. Ouvre les options de l'extension pour le saisir.");
  }

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    throw new AttioError('NETWORK', "Impossible de joindre l'API Attio (connexion réseau ?).");
  }

  if (res.status === 429) {
    const wait = retryDelayMs(res);
    if (retries > 0 && wait <= 5000) {
      await sleep(wait + 100);
      return attio(method, path, body, { token, retries: retries - 1 });
    }
    throw new AttioError('RATE_LIMIT', 'Limite de requêtes Attio atteinte. Réessaie dans quelques secondes.');
  }

  let json = null;
  const text = await res.text();
  if (text) {
    try { json = JSON.parse(text); } catch (_) { json = null; }
  }

  if (res.ok) return json;

  const apiMsg = (json && json.message) || res.statusText || 'Erreur inconnue';
  if (res.status === 401) {
    throw new AttioError('INVALID_TOKEN', 'Token Attio invalide ou révoqué. Vérifie-le dans les options.', apiMsg);
  }
  if (res.status === 403) {
    throw new AttioError('FORBIDDEN', "Le token n'a pas les droits nécessaires (scopes). Voir le README.", apiMsg);
  }
  if (res.status === 404) {
    throw new AttioError('NOT_FOUND', apiMsg, apiMsg);
  }
  if (res.status === 400 || res.status === 422) {
    throw new AttioError('VALIDATION', 'Attio a refusé les données : ' + apiMsg, apiMsg);
  }
  throw new AttioError('API', `Erreur Attio (${res.status}) : ${apiMsg}`, apiMsg);
}
