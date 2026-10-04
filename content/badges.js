// Badges « Dans Attio / Pas dans Attio » + pont avec le popup.
// Lit uniquement le DOM affiché par l'utilisateur ; tous les appels Attio
// passent par le service worker.
(function () {
  const U = globalThis.AttioUrl;
  const X = globalThis.AttioExtractor;
  const DEBOUNCE_MS = 400;

  let observer = null;
  let timer = null;
  let running = false;
  let rescan = false;
  let lastUrl = location.href;
  let stopped = false;

  function contextAlive() {
    try { return !!chrome.runtime && !!chrome.runtime.id; } catch (_) { return false; }
  }

  function send(msg) {
    return new Promise((resolve) => {
      if (!contextAlive()) return resolve({ ok: false, error: { code: 'CONTEXT' } });
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: { code: 'CONTEXT', message: chrome.runtime.lastError.message } });
          else resolve(res || { ok: false, error: { code: 'CONTEXT' } });
        });
      } catch (e) {
        resolve({ ok: false, error: { code: 'CONTEXT', message: e.message } });
      }
    });
  }

  // ------------------------------------------------------------ rendu
  function formatDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('fr-FR') : '';
  }

  function makeBadge(key, scope) {
    const b = document.createElement('span');
    b.className = 'attio-badge attio-badge--pending';
    b.dataset.attioKey = key;
    b.dataset.attioScope = scope;
    b.textContent = 'Attio…';
    return b;
  }

  // Bouton du badge de profil : ouvre le formulaire (même effet que l'icône).
  function addOpenButton(badge, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'attio-badge__action';
    btn.textContent = label;
    btn.title = 'Ouvrir le formulaire Attio (raccourci : ⌥⇧A)';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const res = await send({ type: 'openPopup' });
      if (!res.ok) btn.title = "Ouverture impossible ici : clique sur l'icône de l'extension ou fais ⌥⇧A.";
    });
    badge.appendChild(btn);
  }

  function render(badge, result) {
    badge.className = 'attio-badge';
    badge.textContent = '';
    badge.removeAttribute('title');
    const isProfile = badge.dataset.attioScope === 'profile';
    if (!result || result.status === 'absent') {
      badge.classList.add('attio-badge--absent');
      badge.append('Pas dans Attio');
      if (isProfile) addOpenButton(badge, '＋ Ajouter');
      return;
    }
    const link = document.createElement('a');
    link.href = result.webUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (result.status === 'found') {
      badge.classList.add('attio-badge--found');
      link.textContent = 'Dans Attio · ajouté le ' + formatDate(result.createdAt);
    } else {
      badge.classList.add('attio-badge--probable');
      link.textContent = result.status === 'homonym'
        ? 'Probablement dans Attio · homonyme possible'
        : 'Probablement dans Attio';
      badge.title = result.status === 'homonym'
        ? `Une fiche « ${result.fullName} » existe, mais l'entreprise ne correspond pas ou n'est pas visible.`
        : `Même nom et même entreprise que la fiche « ${result.fullName} ».`;
    }
    link.addEventListener('click', (e) => e.stopPropagation());
    badge.appendChild(link);
    if (isProfile) addOpenButton(badge, result.status === 'found' ? 'Mettre à jour' : '＋ Ajouter');
  }

  function renderError(badge, error) {
    badge.className = 'attio-badge attio-badge--error';
    const messages = {
      NO_TOKEN: 'Attio : token non configuré',
      INVALID_TOKEN: 'Attio : token invalide',
      RATE_LIMIT: 'Attio : trop de requêtes, réessaie',
      FORBIDDEN: 'Attio : droits insuffisants',
      NETWORK: 'Attio : hors ligne'
    };
    badge.textContent = messages[error.code] || 'Attio : erreur';
    badge.title = error.message || '';
  }

  // ------------------------------------------------------------ collecte
  function collectProfile(items) {
    const nameEl = X.profileNameElement();
    let badge = document.querySelector('.attio-badge[data-attio-scope="profile"]');
    if (!nameEl) {
      if (badge) badge.remove(); // panneau latéral refermé
      return;
    }
    const profile = X.extractProfile();
    if (!profile) return;
    const handle = U.extractHandle(profile.linkedinUrl);
    const key = handle ? 'h:' + handle : 's:' + profile.salesnavId;
    if (badge && badge.dataset.attioKey === key && badge.previousElementSibling === nameEl) return;
    if (badge) badge.remove();
    badge = makeBadge(key, 'profile');
    nameEl.insertAdjacentElement('afterend', badge);
    items.push({
      badge,
      item: handle
        ? { key, handle }
        : { key, salesnavId: profile.salesnavId, name: profile.fullName, company: profile.company }
    });
  }

  function collectResults(results, items, keyOf, itemOf) {
    for (const r of results) {
      const key = keyOf(r);
      let badge = r.card.querySelector('.attio-badge[data-attio-scope="result"]');
      // LinkedIn recycle les cartes : si le contenu a changé, on refait le badge.
      if (badge && badge.dataset.attioKey === key) continue;
      if (badge) badge.remove();
      badge = makeBadge(key, 'result');
      r.anchor.insertAdjacentElement('afterend', badge);
      items.push({ badge, item: { key, ...itemOf(r) } });
    }
  }

  async function scan() {
    if (stopped) return;
    if (!contextAlive()) return stop();
    if (running) { rescan = true; return; }
    running = true;
    try {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        document.querySelectorAll('.attio-badge[data-attio-scope="profile"]').forEach((b) => b.remove());
      }
      const type = U.pageType(location.href);
      const items = [];
      if (type === 'profile' || type === 'salesnav-lead') {
        collectProfile(items);
      } else if (type === 'search') {
        collectResults(X.extractSearchResults(), items, (r) => 'h:' + r.handle, (r) => ({ handle: r.handle }));
      } else if (type === 'salesnav-search') {
        collectProfile(items); // panneau latéral, s'il est ouvert
        collectResults(
          X.extractSalesNavResults(), items,
          (r) => 's:' + r.salesnavId,
          (r) => ({ salesnavId: r.salesnavId, name: r.name, company: r.company })
        );
      }
      if (!items.length) return;

      // Une seule requête pour tous les nouveaux éléments visibles (le cache
      // et le regroupement sont gérés par le service worker).
      const res = await send({ type: 'lookupBatch', items: items.map((i) => i.item) });
      if (!res.ok) {
        if (res.error.code === 'CONTEXT') return stop();
        items.forEach(({ badge }) => renderError(badge, res.error));
        return;
      }
      for (const { badge, item } of items) {
        if (badge.isConnected) render(badge, res.data[item.key]);
      }
    } finally {
      running = false;
      if (rescan) { rescan = false; schedule(); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(scan, DEBOUNCE_MS);
  }

  function stop() {
    stopped = true;
    if (observer) observer.disconnect();
    clearTimeout(timer);
  }

  function reset() {
    document.querySelectorAll('.attio-badge').forEach((b) => b.remove());
    schedule();
  }

  // ------------------------------------------------------------ popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !msg) return false;
    if (msg.type === 'extractProfile') {
      sendResponse({ ok: true, data: X.extractProfile(), pageType: U.pageType(location.href) });
    } else if (msg.type === 'diagnose') {
      sendResponse({ ok: true, data: X.diagnose() });
    } else if (msg.type === 'refreshBadges') {
      reset();
      sendResponse({ ok: true });
    }
    return false;
  });

  // ------------------------------------------------------------ démarrage
  // Le MutationObserver couvre à la fois le scroll (nouveaux résultats rendus)
  // et la navigation SPA de LinkedIn (le DOM change sans rechargement).
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // Ignorer nos propres insertions de badges.
      const nodes = [...m.addedNodes, ...m.removedNodes];
      if (nodes.length && nodes.every((n) => n.nodeType === 1 && n.classList.contains('attio-badge'))) continue;
      if (m.target.closest && m.target.closest('.attio-badge')) continue;
      schedule();
      return;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
})();
