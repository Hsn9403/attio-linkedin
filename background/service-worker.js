// Service worker : seul point de contact avec l'API Attio.
// Le content script, le popup et les options passent tous par ici.
import { AttioError } from './attio-client.js';
import { testConnection, lookupProfile, lookupBatch, captureProfile, attributeStatus } from './crm.js';
import { getSettings } from './attio-client.js';
import { cacheClear } from './cache.js';

const handlers = {
  testConnection: (msg) => testConnection(msg.token),
  lookupProfile: (msg) => lookupProfile(msg.profile),
  lookupBatch: (msg) => lookupBatch(msg.items || []),
  captureProfile: (msg) => captureProfile(msg.payload),
  attributeStatus: async () => attributeStatus(await getSettings(), { force: true }),
  clearCache: () => cacheClear(),
  // Ouvre le popup depuis le bouton du badge (chrome.action.openPopup, Chromium récent).
  openPopup: async (msg, sender) => {
    await chrome.action.openPopup(sender.tab ? { windowId: sender.tab.windowId } : undefined);
    return true;
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Ne répondre qu'aux pages de l'extension et aux content scripts LinkedIn.
  if (sender.id !== chrome.runtime.id) return false;
  const handler = msg && handlers[msg.type];
  if (!handler) return false;

  Promise.resolve()
    .then(() => handler(msg, sender))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => {
      const error = err instanceof AttioError
        ? err.toJSON()
        : { code: 'INTERNAL', message: err && err.message ? err.message : String(err) };
      if (error.code === 'INTERNAL') console.error('[Attio]', err);
      sendResponse({ ok: false, error });
    });
  return true; // réponse asynchrone
});

// Un nouveau token ou de nouveaux slugs rendent le cache des badges obsolète.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) cacheClear();
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const { token } = await getSettings();
    if (!token) chrome.runtime.openOptionsPage();
  }
});
