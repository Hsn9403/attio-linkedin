// Page d'options : token Attio + slugs des attributs personnalisés.
(function () {
  const { DEFAULT_SETTINGS } = globalThis.AttioConst;
  const $ = (id) => document.getElementById(id);

  function el(tag, cls, ...children) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.append(...children);
    return e;
  }

  function show(kind, ...content) {
    const r = $('result');
    r.className = kind;
    r.replaceChildren(...content);
    r.hidden = false;
  }

  function readForm() {
    return {
      token: $('token').value.trim(),
      contactTypeSlug: $('contactTypeSlug').value.trim() || DEFAULT_SETTINGS.contactTypeSlug,
      salesnavIdSlug: $('salesnavIdSlug').value.trim() || DEFAULT_SETTINGS.salesnavIdSlug
    };
  }

  async function load() {
    const { settings } = await chrome.storage.local.get('settings');
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    $('token').value = s.token;
    $('contactTypeSlug').value = s.contactTypeSlug;
    $('salesnavIdSlug').value = s.salesnavIdSlug;
  }

  async function save() {
    await chrome.storage.local.set({ settings: readForm() });
    show('ok', 'Enregistré.');
  }

  async function test() {
    const settings = readForm();
    if (!settings.token) return show('err', 'Saisis un token avant de tester.');
    $('test').disabled = true;
    show('', 'Test en cours…');
    await chrome.storage.local.set({ settings });

    const res = await new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: 'testConnection', token: settings.token }, resolve));
    $('test').disabled = false;

    if (!res || !res.ok) {
      const e = (res && res.error) || { message: 'Pas de réponse du service worker.' };
      return show('err', el('strong', '', 'Échec : '), e.message);
    }

    const d = res.data;
    const items = [];
    let kind = 'ok';
    if (d.missingScopes.length) {
      kind = 'warn';
      items.push('Scopes manquants sur le token : ' + d.missingScopes.join(', ') + '. Modifie l\'intégration dans Attio → Settings → Developers.');
    }
    if (d.attributes) {
      const ct = d.attributes.contactType;
      if (!ct.ok) { kind = 'warn'; items.push(ct.problem); }
      else {
        items.push(`Attribut « ${ct.slug} » trouvé (options : ${ct.options.join(', ') || 'aucune'}).`);
        if (!ct.options.length) { kind = 'warn'; items.push('Ajoute au moins une option à cet attribut dans Attio.'); }
      }
      const sn = d.attributes.salesnavId;
      if (!sn.ok) { kind = 'warn'; items.push(sn.problem); }
      else items.push(`Attribut « ${sn.slug} » trouvé.`);
    }

    show(kind,
      el('strong', '', `Connecté au workspace « ${d.workspaceName} » (token ${d.tokenLevel === 'user' ? 'utilisateur' : 'workspace'}).`),
      el('ul', '', ...items.map((t) => el('li', '', t))));
  }

  $('show').addEventListener('change', (e) => { $('token').type = e.target.checked ? 'text' : 'password'; });
  $('save').addEventListener('click', save);
  $('test').addEventListener('click', test);
  load();
})();
