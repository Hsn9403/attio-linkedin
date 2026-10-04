// Popup : formulaire pré-rempli, comparaison avec Attio, capture après clic.
(function () {
  const { parseLocation, locationKey } = globalThis.AttioLocation;
  const $ = (id) => document.getElementById(id);

  let tabId = null;
  let extracted = null; // profil lu sur la page
  let existing = null;  // fiche Attio existante (résumé)

  const ERRORS = {
    NO_TOKEN: 'Aucun token Attio configuré.',
    INVALID_TOKEN: 'Token Attio invalide ou révoqué.',
    FORBIDDEN: "Le token Attio n'a pas les droits nécessaires (scopes).",
    RATE_LIMIT: 'Limite de requêtes Attio atteinte. Réessaie dans quelques secondes.',
    NETWORK: "Impossible de joindre Attio. Vérifie ta connexion."
  };

  function send(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: { code: 'INTERNAL', message: chrome.runtime.lastError.message } });
        else resolve(res);
      });
    });
  }

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else e.setAttribute(k, v);
    }
    for (const c of children) if (c != null) e.append(c);
    return e;
  }

  function attioLink(url, text) {
    return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, text);
  }

  function showStatus(kind, ...content) {
    const s = $('status');
    s.className = 'status' + (kind ? ' status--' + kind : '');
    s.replaceChildren(...content);
    s.hidden = false;
  }

  function showError(error) {
    const msg = ERRORS[error.code] || error.message || 'Erreur inconnue.';
    const parts = [msg];
    if (['NO_TOKEN', 'INVALID_TOKEN', 'FORBIDDEN'].includes(error.code)) {
      const btn = el('button', { type: 'button', class: 'link' }, 'Ouvrir les options');
      btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
      parts.push(' ', btn);
    }
    showStatus('err', ...parts);
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // ------------------------------------------------------------ comparaison
  function differs(field, formValue, attioValue) {
    if (field === 'location') {
      if (!existing.locationParts) return !!formValue;
      return locationKey(parseLocation(formValue)) !== locationKey(existing.locationParts);
    }
    return norm(formValue) !== norm(attioValue);
  }

  const ATTIO_VALUE = { jobTitle: 'jobTitle', company: 'companyName', location: 'location' };

  // Affiche Attio | LinkedIn côte à côte avec « Remplacer » décoché par défaut.
  function updateDiff(field) {
    const box = document.querySelector(`.field[data-field="${field}"] .diff`);
    if (!existing) { box.hidden = true; return; }
    const formValue = $(field).value.trim();
    const attioValue = existing[ATTIO_VALUE[field]] || '';
    const previous = box.querySelector('input[type="checkbox"]');
    const wasChecked = previous ? previous.checked : false;

    if (!formValue) { box.hidden = true; return; }
    if (!attioValue) {
      box.className = 'diff empty';
      box.replaceChildren('Vide dans Attio : sera renseigné.');
      box.hidden = false;
      return;
    }
    if (!differs(field, formValue, attioValue)) { box.hidden = true; return; }

    const cb = el('input', { type: 'checkbox', 'data-replace': field });
    cb.checked = wasChecked;
    box.className = 'diff';
    box.replaceChildren(
      el('div', { class: 'cols' },
        el('div', {}, el('span', {}, 'Attio'), attioValue),
        el('div', {}, el('span', {}, 'LinkedIn'), formValue)),
      el('label', {}, cb, 'Remplacer la valeur Attio')
    );
    box.hidden = false;
  }

  // ------------------------------------------------------------ remplissage
  function fillForm(p) {
    $('firstName').value = p.firstName || '';
    $('lastName').value = p.lastName || '';
    $('jobTitle').value = p.jobTitle || '';
    $('company').value = p.company || '';
    $('location').value = p.location || '';
    $('linkedinUrl').value = p.linkedinUrl || '';
    if (p.salesnavId) {
      $('salesnav').textContent = 'Identifiant Sales Navigator : ' + p.salesnavId +
        (p.linkedinUrl ? '' : ". URL publique non visible. Astuce : ouvre le menu « … » du lead dans Sales Nav, laisse-le ouvert et rouvre l'extension. Facultatif : l'ID suffit à éviter les doublons.");
      $('salesnav').hidden = false;
    }
    $('form').hidden = false;
  }

  function applyLookup(data) {
    existing = data.existing;
    const attrs = data.attributes;
    // Les options proviennent de l'attribut select dans Attio.
    for (const t of data.contactTypes) $('contactType').append(el('option', { value: t }, t));

    if (existing) {
      showStatus('ok', 'Déjà dans Attio · ajouté le ' + fmtDate(existing.createdAt) + ' · ',
        attioLink(existing.webUrl, 'Voir la fiche'));
      $('firstName').readOnly = true;
      $('lastName').readOnly = true;
      $('name-locked').hidden = false;
      $('submit').textContent = 'Mettre à jour Attio';
      if (existing.contactType) {
        const sel = $('contactType');
        if (![...sel.options].some((o) => o.value === existing.contactType)) {
          sel.append(el('option', { value: existing.contactType }, existing.contactType));
        }
        sel.value = existing.contactType;
      }
    } else {
      showStatus('', 'Pas encore dans Attio.');
      if (data.homonyms.length) {
        const box = $('homonyms');
        const list = el('ul');
        for (const h of data.homonyms) {
          list.append(el('li', {}, attioLink(h.webUrl, h.fullName), h.companyName ? ' · ' + h.companyName : ''));
        }
        box.replaceChildren('Homonyme(s) déjà dans Attio, vérifie qu\'il ne s\'agit pas de la même personne :', list);
        box.hidden = false;
      }
    }

    if (!attrs.contactType.ok) {
      $('contactType').disabled = true;
      $('type-problem').textContent = attrs.contactType.problem;
      $('type-problem').hidden = false;
    } else if (!attrs.contactType.options.length) {
      $('type-problem').textContent = `L'attribut « ${attrs.contactType.slug} » n'a aucune option dans Attio. Ajoute-les pour pouvoir les utiliser.`;
      $('type-problem').hidden = false;
    }
    if (extracted.salesnavId && !attrs.salesnavId.ok) {
      $('salesnav').textContent += '. ' + attrs.salesnavId.problem;
    }

    for (const f of Object.keys(ATTIO_VALUE)) updateDiff(f);
  }

  // ------------------------------------------------------------ envoi
  async function submit(e) {
    e.preventDefault();
    const btn = $('submit');
    btn.disabled = true;
    btn.textContent = 'Envoi…';

    const replace = {};
    document.querySelectorAll('input[data-replace]').forEach((cb) => { replace[cb.dataset.replace] = cb.checked; });

    const res = await send({
      type: 'captureProfile',
      payload: {
        profile: {
          firstName: $('firstName').value,
          lastName: $('lastName').value,
          jobTitle: $('jobTitle').value,
          company: $('company').value,
          // L'URL de l'entreprise ne vaut que si le nom n'a pas été modifié à la main.
          companyLinkedinUrl: $('company').value.trim() === (extracted.company || '').trim()
            ? extracted.companyLinkedinUrl || null : null,
          location: $('location').value,
          linkedinUrl: $('linkedinUrl').value,
          salesnavId: extracted.salesnavId || null
        },
        contactType: $('contactType').disabled ? '' : $('contactType').value,
        note: $('note').value,
        replace
      }
    });

    if (!res.ok) {
      showError(res.error);
      btn.disabled = false;
      btn.textContent = existing ? 'Mettre à jour Attio' : 'Ajouter à Attio';
      return;
    }

    const d = res.data;
    const title = { created: 'Ajouté à Attio.', updated: 'Fiche mise à jour.', unchanged: 'Aucun champ modifié.' }[d.action];
    const body = [el('strong', {}, title), ' ', attioLink(d.webUrl, 'Ouvrir dans Attio')];
    if (d.changed.length && d.action !== 'unchanged') body.push(el('div', {}, 'Champs écrits : ' + d.changed.join(', ')));
    if ($('note').value.trim()) body.push(el('div', {}, 'Note ajoutée.'));
    showStatus('ok', ...body);

    if (d.warnings.length) {
      const w = $('result');
      w.className = 'notice notice--warn';
      w.replaceChildren(el('ul', {}, ...d.warnings.map((t) => el('li', {}, t))));
      w.hidden = false;
    }
    $('form').hidden = true;
    chrome.tabs.sendMessage(tabId, { type: 'refreshBadges' }, () => void chrome.runtime.lastError);
  }

  // ------------------------------------------------------------ démarrage
  async function init() {
    $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('diagnose').addEventListener('click', () => {
      chrome.tabs.sendMessage(tabId, { type: 'diagnose' }, async (r) => {
        if (chrome.runtime.lastError || !r) return;
        try {
          await navigator.clipboard.writeText(r.data);
          $('diagnose').textContent = 'Diagnostic copié : colle-le à ton développeur.';
        } catch (_) {
          $('diagnose').textContent = 'Copie impossible.';
        }
      });
    });
    $('form').addEventListener('submit', submit);
    for (const f of Object.keys(ATTIO_VALUE)) $(f).addEventListener('input', () => updateDiff(f));

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab && tab.id;
    const type = tab && tab.url ? globalThis.AttioUrl.pageType(tab.url) : 'other';
    if (!['profile', 'salesnav-lead', 'salesnav-search'].includes(type)) {
      showStatus('', 'Ouvre un profil LinkedIn (linkedin.com/in/…) ou une fiche lead Sales Navigator, puis clique à nouveau sur l\'extension.');
      return;
    }

    const res = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'extractProfile' }, (r) => {
        resolve(chrome.runtime.lastError ? null : r);
      });
    });
    if (!res) {
      showStatus('err', "L'extension n'est pas encore active sur cet onglet. Recharge la page LinkedIn (⌘R) puis réessaie.");
      return;
    }
    if (!res.data && type === 'salesnav-search') {
      showStatus('', "Clique sur le nom d'un résultat pour ouvrir son panneau, puis clique à nouveau sur l'extension.");
      return;
    }
    if (!res.data) {
      showStatus('err', "Profil non détecté : attends que la page soit complètement chargée, puis réessaie. Si le problème persiste, LinkedIn a peut-être changé sa page (voir content/selectors.js).");
      return;
    }

    extracted = res.data;
    fillForm(extracted);
    if (extracted.incomplete) {
      $('homonyms').className = 'notice notice--warn';
      $('homonyms').textContent = 'Nom non détecté sur la page : complète le formulaire à la main.';
      $('homonyms').hidden = false;
    }
    showStatus('', 'Recherche dans Attio…');

    const lookup = await send({ type: 'lookupProfile', profile: extracted });
    if (!lookup.ok) {
      showError(lookup.error);
      if (['NO_TOKEN', 'INVALID_TOKEN'].includes(lookup.error.code)) $('form').hidden = true;
      return;
    }
    applyLookup(lookup.data);
  }

  init();
})();
