// Cache des résultats de badges, TTL 10 minutes.
// chrome.storage.session : survit à la mise en veille du service worker,
// vidé à la fermeture du navigateur.
import '../shared/constants.js';

const { CACHE_TTL_MS } = globalThis.AttioConst;
const PREFIX = 'badge:';

export async function cacheGet(keys) {
  if (!keys.length) return {};
  const stored = await chrome.storage.session.get(keys.map((k) => PREFIX + k));
  const out = {};
  const now = Date.now();
  for (const k of keys) {
    const entry = stored[PREFIX + k];
    if (entry && now - entry.at < CACHE_TTL_MS) out[k] = entry.result;
  }
  return out;
}

export async function cacheSet(map) {
  const at = Date.now();
  const toStore = {};
  for (const [k, result] of Object.entries(map)) toStore[PREFIX + k] = { at, result };
  if (Object.keys(toStore).length) await chrome.storage.session.set(toStore);
}

export async function cacheClear() {
  const all = await chrome.storage.session.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.session.remove(keys);
}
