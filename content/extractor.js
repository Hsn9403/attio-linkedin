// Extraction des données affichées par LinkedIn. Lecture seule : aucun clic,
// aucune navigation, aucun chargement supplémentaire.
(function () {
  const S = globalThis.AttioSelectors;
  const U = globalThis.AttioUrl;

  // ---------------------------------------------------------------- helpers
  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  // LinkedIn duplique souvent le texte (span visible aria-hidden + span pour lecteur d'écran).
  function textOf(el) {
    if (!el) return '';
    const visible = el.matches('[aria-hidden="true"]') ? el : el.querySelector(':scope > span[aria-hidden="true"], span[aria-hidden="true"]');
    const src = visible || el;
    const clone = src.cloneNode(true);
    clone.querySelectorAll('.attio-badge, .visually-hidden').forEach((n) => n.remove());
    return clean(clone.textContent);
  }

  function firstEl(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        if (el && textOf(el)) return el;
      } catch (_) { /* sélecteur invalide : on passe au suivant */ }
    }
    return null;
  }

  function firstText(selectors, root = document) {
    return textOf(firstEl(selectors, root));
  }

  // Retire emojis, mentions entre parenthèses et certifications (", CFA", ", MBA").
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

  // "Jane Doe 🚀 Executive MBA, HEC Paris" -> "Jane Doe"
  // Coupe au premier émoji, à la première virgule ou à un séparateur « | » / « - ».
  function cleanName(name) {
    const n = clean(name).split(new RegExp(EMOJI.source + '|\\s[|–—-]\\s|,', 'u'))[0];
    return clean(n.replace(/\(.*?\)/g, ''));
  }

  function splitName(full) {
    const parts = cleanName(full).split(' ').filter(Boolean);
    if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  // "CEO chez Acme | Board member" -> { title: "CEO", company: "Acme" }
  function splitHeadline(headline) {
    const h = clean(headline);
    const lower = h.toLowerCase();
    for (const sep of S.headlineCompanySeparators) {
      if (sep === ' | ') continue;
      const i = lower.indexOf(sep);
      if (i > 0) {
        const company = h.slice(i + sep.length).split(/\s[|·•,]\s|\s-\s/)[0];
        return { title: clean(h.slice(0, i)), company: clean(company) };
      }
    }
    return { title: h.split(' | ')[0], company: '' };
  }

  // ------------------------------------------------ stratégie 1 : balises meta
  function fromMeta(handle) {
    const out = {};
    const ogUrl = document.querySelector(S.meta.ogUrl);
    // Sur une SPA, les meta peuvent rester celles de la page précédente : on vérifie.
    if (!ogUrl || U.extractHandle(ogUrl.content) !== handle) return out;
    const ogTitle = document.querySelector(S.meta.ogTitle);
    if (ogTitle) out.fullName = clean(ogTitle.content.replace(/\s*\|\s*LinkedIn.*$/i, '').split(' - ')[0]);
    const desc = document.querySelector(S.meta.description);
    if (desc) {
      const d = desc.content;
      const exp = d.match(/(?:Experience|Expérience)\s*:\s*([^·]+)/i);
      const loc = d.match(/(?:Location|Lieu)\s*:\s*([^·]+)/i);
      if (exp) out.company = clean(exp[1]);
      if (loc) out.location = clean(loc[1]);
    }
    return out;
  }

  // ------------------------------------------------ stratégie 2 : JSON-LD
  function fromJsonLd(handle) {
    const out = {};
    for (const script of document.querySelectorAll(S.meta.jsonLd)) {
      let data;
      try { data = JSON.parse(script.textContent); } catch (_) { continue; }
      const nodes = [].concat(data['@graph'] || data);
      const person = nodes.find((n) => n && n['@type'] === 'Person' && (!n.url || U.extractHandle(n.url) === handle));
      if (!person) continue;
      if (person.name) out.fullName = clean(person.name);
      const title = [].concat(person.jobTitle || [])[0];
      if (title) out.jobTitle = clean(title);
      const org = [].concat(person.worksFor || [])[0];
      if (org && org.name) out.company = clean(org.name);
      const addr = person.address;
      if (addr) out.location = clean([addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', '));
      break;
    }
    return out;
  }

  // ------------------------------------------------ stratégie 3 : sélecteurs CSS
  function companyFromButton(root) {
    for (const sel of S.profile.currentCompanyButton) {
      const el = root.querySelector(sel) || document.querySelector(sel);
      if (!el) continue;
      const label = el.getAttribute('aria-label') || '';
      const m = label.match(/^(?:Current company|Entreprise actuelle)\s*:\s*(.+?)(?:\.\s*(?:Click|Cliquez|Cliquer).*)?$/i);
      if (m) return clean(m[1]);
      const t = textOf(el);
      if (t) return t;
    }
    return firstText(S.profile.currentCompanyText, root);
  }

  function companyFromExperience() {
    const anchor = firstElRaw(S.profile.experienceAnchor);
    const section = anchor && anchor.closest('section');
    if (!section) return '';
    const t = firstText(S.profile.experienceFirstCompany, section);
    return clean(t.split(' · ')[0]);
  }

  // Conteneur de la section Expérience : ancre #experience, sinon le titre
  // « Expérience » ; on remonte jusqu'au bloc qui contient des dates.
  function experienceSection() {
    const dateRe = S.salesnavLead.roleDateLine;
    const climb = (el) => {
      for (let i = 0; el && i < 10; i++, el = el.parentElement) {
        if (el.tagName === 'SECTION' || (dateRe.test(el.textContent) && el.textContent.length < 30000)) return el;
      }
      return null;
    };
    const anchor = firstElRaw(S.profile.experienceAnchor);
    if (anchor) {
      const sec = anchor.closest('section') || climb(anchor.parentElement);
      if (sec) return sec;
    }
    const main = document.querySelector('main') || document.body;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (S.profile.experienceHeading.test(clean(n.data)) && !isHidden(n)) {
        const sec = climb(n.parentElement);
        if (sec) return sec;
      }
    }
    return null;
  }

  // Poste le plus récent de la section Expérience : { title, company }.
  // Deux formes chez LinkedIn, repérées par l'ordre des textes :
  //  - poste seul :   Titre / « Entreprise · CDI » / dates
  //  - poste groupé : Entreprise / « CDI · 5 ans » / Titre / (type) / dates
  function latestExperience() {
    const empty = { title: '', company: '' };
    const section = experienceSection();
    if (!section) return empty;
    const L = S.profile;
    const dateRe = S.salesnavLead.roleDateLine;

    const leaves = [];
    let afterHeading = !L.experienceHeading.test(clean(section.textContent).slice(0, 40)) ? true : false;
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = clean(n.data);
      if (!t || isHidden(n)) continue;
      if (L.experienceHeading.test(t)) { afterHeading = true; continue; }
      if (!afterHeading || L.experienceNoise.test(t)) continue;
      if (leaves.length && leaves[leaves.length - 1] === t) continue; // doublon lecteur d'écran
      leaves.push(t);
    }
    const d = leaves.findIndex((t) => dateRe.test(t));
    if (d < 1) return empty;

    const companyOf = (t) => clean(t.split(' · ')[0]);
    if (d >= 3 && L.durationOnly.test(leaves[1]) && !dateRe.test(leaves[1])) {
      return { title: leaves[2], company: companyOf(leaves[0]) };
    }
    if (d >= 2) {
      const second = leaves[1];
      return { title: leaves[0], company: L.employmentType.test(second) ? '' : companyOf(second) };
    }
    return { title: leaves[0], company: '' };
  }

  function firstElRaw(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // --------------------------- stratégie 3a : repères sémantiques (sans classes CSS)
  function nameFromTitle() {
    let t = document.title || '';
    for (const re of S.profile.titleCleanup) t = t.replace(re, '');
    t = clean(t);
    return t && !/^linkedin$/i.test(t) ? t : '';
  }

  function isHidden(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest('.visually-hidden, [class*="visually-hidden"], .attio-badge, script, style');
  }

  // Élément de la page dont le texte est exactement le nom (confirme que le
  // titre de l'onglet correspond bien au profil affiché).
  function findNameElement(name) {
    if (!name) return null;
    const main = document.querySelector('main') || document.body;
    for (const h of main.querySelectorAll('h1, h2')) {
      if (clean(h.textContent) === name && !isHidden(h)) return h;
    }
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (clean(n.data) === name && !isHidden(n)) return n.parentElement;
    }
    return null;
  }

  function topCardFrom(nameEl) {
    let el = nameEl;
    for (let i = 0; i < 15 && el.parentElement; i++) {
      el = el.parentElement;
      if (S.profile.contactInfoLink.some((s) => el.querySelector(s))) return el;
      if (el.tagName === 'SECTION') return el;
    }
    return nameEl.parentElement || document.body;
  }

  // Textes visibles qui suivent le nom, dans l'ordre du document.
  function textsAfter(root, startEl, max = 15) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n && out.length < max; n = walker.nextNode()) {
      if (startEl.contains(n) || !(startEl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const t = clean(n.data);
      if (!t || isHidden(n) || S.profile.noiseText.test(t)) continue;
      out.push(t);
    }
    return out;
  }

  function locationNear(root) {
    for (const sel of S.profile.contactInfoLink) {
      const link = root.querySelector(sel) || document.querySelector(sel);
      if (!link) continue;
      let p = link.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        const clone = p.cloneNode(true);
        clone.querySelectorAll('a, .visually-hidden, .attio-badge').forEach((a) => a.remove());
        const t = clean(clone.textContent.replace(/·/g, ' '));
        if (t) return t;
      }
    }
    return '';
  }

  // URL LinkedIn de l'entreprise dont le nom est `name` : lien texte, aria-label
  // ou logo (alt) pointant vers /company/… ou /sales/company/….
  function companyUrlFor(root, name) {
    const target = clean(name).toLowerCase();
    if (!target || !root) return null;
    for (const a of root.querySelectorAll(S.salesnavLead.companyPageLink)) {
      const slug = U.extractCompanySlug(a.href);
      if (!slug) continue;
      const img = a.querySelector('img[alt]');
      const labels = [textOf(a), a.getAttribute('aria-label'), img && img.getAttribute('alt')]
        .map((t) => clean(t).toLowerCase().replace(/^(entreprise actuelle|current company)\s*:\s*/, '').replace(/^logo (de |of )?/, ''))
        .filter(Boolean);
      if (labels.some((l) => l === target || l.startsWith(target) || target.startsWith(l))) {
        return U.normalizeCompanyUrl(a.href);
      }
    }
    return null;
  }

  function companyNear(root) {
    for (const sel of S.profile.companyLink) {
      for (const a of root.querySelectorAll(sel)) {
        const t = textOf(a) || clean(a.getAttribute('aria-label'));
        if (t && !/^\d/.test(t)) return t.replace(/^(Entreprise actuelle|Current company)\s*:\s*/i, '').split(/\.\s*(Cliquez|Click)/)[0].trim();
      }
    }
    return '';
  }

  function fromSemantic() {
    const fullName = nameFromTitle();
    const nameEl = findNameElement(fullName);
    if (!nameEl) return { nameEl: null };
    const root = topCardFrom(nameEl);
    // L'entreprise actuelle est souvent dans la colonne de droite de l'en-tête :
    // on cherche dans un conteneur plus large que la colonne du nom.
    let wideTop = nameEl.closest('section') || root;
    for (let i = 0; i < 3 && wideTop.parentElement && wideTop.parentElement.tagName !== 'MAIN'; i++) {
      if (wideTop.querySelector(S.profile.companyLink.join(',') + ',' + S.profile.currentCompanyButton.join(','))) break;
      wideTop = wideTop.parentElement;
    }
    const location = locationNear(root);
    const texts = textsAfter(root, nameEl).filter((t) => t !== fullName && t !== location);
    const headline = texts[0] || '';
    const split = splitHeadline(headline);
    return {
      nameEl,
      fullName,
      headline,
      jobTitle: split.title || headline,
      company: companyNear(wideTop) || companyFromButton(wideTop) || split.company,
      location
    };
  }

  function fromCss() {
    const sem = fromSemantic();
    if (sem.nameEl) return sem;
    const root = firstElRaw(S.profile.topCard) || document;
    const nameEl = firstEl(S.profile.name, root) || firstEl(S.profile.name);
    const headline = firstText(S.profile.headline, root);
    const location = firstText(S.profile.location, root);
    const split = splitHeadline(headline);
    let company = companyFromButton(root) || companyFromExperience() || split.company;
    return {
      fullName: textOf(nameEl),
      headline,
      jobTitle: split.title || headline,
      company,
      location
    };
  }

  // ------------------------------------------------ API publique
  function extractProfile() {
    const type = U.pageType(location.href);
    if (type === 'profile') return extractLinkedInProfile();
    if (type === 'salesnav-lead') return extractSalesNavLead();
    if (type === 'salesnav-search') return extractSalesNavDrawer();
    return null;
  }

  function extractLinkedInProfile() {
    const handle = U.extractHandle(location.href);
    if (!handle) return null;
    const meta = fromMeta(handle);
    const ld = fromJsonLd(handle);
    const css = fromCss();
    // Ordre de priorité demandé : meta → JSON-LD → CSS (chaque source n'est
    // utilisée que si elle correspond bien au profil affiché).
    const pick = (field) => meta[field] || ld[field] || css[field] || '';
    const fullName = cleanName(pick('fullName'));
    const exp = latestExperience();
    const canonicalEl = firstElRaw(S.profile.canonical);
    const canonical = canonicalEl && (canonicalEl.href || canonicalEl.content);
    const linkedinUrl = U.extractHandle(canonical) === handle ? U.normalizeProfileUrl(canonical) : U.normalizeProfileUrl(location.href);
    return {
      source: 'linkedin',
      fullName,
      ...splitName(fullName),
      // Priorité au poste le plus récent de la section Expérience.
      jobTitle: exp.title || ld.jobTitle || css.jobTitle || '',
      headline: css.headline || '',
      company: pick('company') || exp.company,
      location: pick('location'),
      linkedinUrl,
      companyLinkedinUrl: companyUrlFor(document.querySelector('main') || document.body, pick('company') || exp.company),
      salesnavId: null,
      incomplete: !fullName
    };
  }

  // root = document (fiche lead complète) ou le panneau latéral d'une recherche.
  // Premier lien vers un profil public avec un vrai handle (pas un identifiant
  // interne « ACwAA… », qui ne correspondrait pas à l'URL stockée dans Attio).
  function publicProfileLink(root) {
    for (const sel of S.salesnavLead.publicProfileLink) {
      for (const a of root.querySelectorAll(sel)) {
        const h = U.extractHandle(a.href);
        if (h && !/^acw?aa/i.test(h)) return a;
      }
    }
    return null;
  }

  function followingTexts(root, startEl) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (startEl && (startEl.contains(n) || !(startEl.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))) continue;
      if (isHidden(n) || !clean(n.data)) continue;
      out.push(n);
    }
    return out;
  }

  // Ne regarde que ce qui suit le nom (sinon le nom lui-même peut ressembler à un lieu).
  function guessLocation(root, startEl, exclude) {
    const L = globalThis.AttioLocation;
    for (const n of followingTexts(root, startEl)) {
      const t = clean(n.data);
      if (t.length < 3 || t.length > 80 || exclude.includes(t)) continue;
      if (/[|@&•]|\d/.test(t) || EMOJI.test(t)) continue; // headline, statistiques, dates…
      if (S.salesnavLead.locationKeywords.test(t)) return t;
      if (L && L.parseLocation(t).country_code && t.split(',').length <= 4) return t;
      // « Ville, Région, Pays » même si le pays est inconnu de notre liste.
      const parts = t.split(',').map((x) => x.trim());
      if (parts.length >= 2 && parts.length <= 4 && parts.every((x) => x && x.length <= 40 && /^\p{Lu}/u.test(x))) return t;
    }
    return '';
  }

  // Premier poste de la section « Postes actuels » : { title, company }.
  function currentRole(root) {
    const L = S.salesnavLead;
    const texts = followingTexts(root, null);
    const i = texts.findIndex((n) => L.currentRoleHeading.test(clean(n.data)));
    if (i < 0) return { title: '', company: '' };
    const heading = texts[i].parentElement;
    const first = texts.slice(i + 1).find((n) => !heading.contains(n));
    if (!first) return { title: '', company: '' };
    // Remonter jusqu'à la ligne complète du poste, sans inclure la ligne des dates.
    let line = first.parentElement;
    while (line.parentElement && line.parentElement !== root && !line.parentElement.contains(heading) &&
           !L.roleDateLine.test(line.parentElement.textContent)) {
      line = line.parentElement;
    }
    const text = clean(line.textContent);
    if (L.roleDateLine.test(text)) return { title: clean(first.data), company: '' };
    const [title, company] = text.split(L.roleCompanySeparator);
    return { title: clean(title), company: clean(company || '') };
  }

  function extractSalesNavLead(root = document, salesnavId = U.extractSalesNavId(location.href), wideRoot = null) {
    const L = S.salesnavLead;
    const nameEl = firstEl(L.name, root);
    const fullName = cleanName(textOf(nameEl));
    if (!fullName || !salesnavId) return null;
    const wide = wideRoot || root;
    // Le lien public peut aussi être dans un menu ou une fenêtre que
    // l'utilisateur a lui-même ouverts (« … → Voir le profil LinkedIn »).
    const link = publicProfileLink(wide) ||
      [...document.querySelectorAll(L.userOpenedOverlays)].map(publicProfileLink).find(Boolean);
    const headline = firstText(L.headline, root) || firstText(L.headline, wide);
    const role = currentRole(wide);
    const company = role.company || firstText(L.company, root) || firstText(L.company, wide) ||
      splitHeadline(headline).company;
    return {
      source: 'salesnav',
      fullName,
      ...splitName(fullName),
      // Priorité au poste actuel le plus récent, puis au titre Sales Nav, puis au headline.
      jobTitle: role.title || firstText(['[data-anonymize="job-title"]', '[data-anonymize="title"]'], wide) ||
        splitHeadline(headline).title,
      headline,
      company,
      location: firstText(L.location, root) || firstText(L.location, wide) ||
        guessLocation(wide, nameEl, [fullName, company, headline]),
      linkedinUrl: link ? U.normalizeProfileUrl(link.href) : null,
      companyLinkedinUrl: companyUrlFor(wide, company),
      salesnavId
    };
  }

  const isResultCard = (el) => !!closestCard(el, S.salesnavSearch.card, false);

  // Panneau latéral d'un lead sur une page de recherche Sales Nav.
  function findSalesNavDrawer() {
    const R = S.salesnavSearch;
    for (const sel of R.drawerName) {
      for (const nameEl of document.querySelectorAll(sel)) {
        if (isResultCard(nameEl) || !textOf(nameEl)) continue;
        // Remonter jusqu'au conteneur qui porte aussi titre / entreprise / lieu,
        // sans englober la liste des résultats.
        const details = [...S.salesnavLead.location, ...S.salesnavLead.company, ...S.salesnavLead.headline].join(',');
        let id = nameEl.matches(R.leadLink) ? U.extractSalesNavId(nameEl.href) : null;
        let root = nameEl;
        let best = null;
        for (let i = 0; i < R.drawerMaxDepth && root.parentElement; i++) {
          const up = root.parentElement;
          if (R.card.slice(0, -1).some((s) => up.querySelector(s))) break;
          root = up;
          if (!id) {
            const link = root.querySelector(R.leadLink);
            id = link && U.extractSalesNavId(link.href);
          }
          if (id) best = root;
          if (id && root.querySelector(details)) break;
        }
        if (id && best) {
          // Conteneur élargi (tout le panneau) pour la localisation et le lien public.
          let wide = best;
          for (let i = 0; i < R.drawerMaxDepth && wide.parentElement; i++) {
            const up = wide.parentElement;
            if (up === document.body || R.card.slice(0, -1).some((s) => up.querySelector(s))) break;
            wide = up;
          }
          return { nameEl, root: best, wide, salesnavId: id };
        }
      }
    }
    return null;
  }

  function extractSalesNavDrawer() {
    const d = findSalesNavDrawer();
    return d ? extractSalesNavLead(d.root, d.salesnavId, d.wide) : null;
  }

  function closestCard(el, selectors, fallback = true) {
    for (const sel of selectors) {
      const c = el.closest(sel);
      if (c) return c;
    }
    return fallback ? el.parentElement : null;
  }

  // Résultats de recherche LinkedIn visibles : [{ card, anchor, handle, name, company }]
  function extractSearchResults() {
    const R = S.search;
    const root = firstElRaw(R.root) || document.body;
    const seen = new Map();
    for (const link of root.querySelectorAll(R.profileLink)) {
      const handle = U.extractHandle(link.href);
      if (!handle) continue;
      const card = closestCard(link, R.card);
      if (!card || seen.has(card)) continue;
      const name = cleanName(firstText(R.nameInLink, link) || textOf(link));
      if (!name) continue; // lien image ou « relations en commun » : on attend le lien avec le nom
      const subtitle = firstText(R.subtitle, card);
      seen.set(card, { card, anchor: link, handle, name, company: splitHeadline(subtitle).company });
    }
    return [...seen.values()];
  }

  // Résultats Sales Navigator visibles : [{ card, anchor, salesnavId, name, company }]
  function extractSalesNavResults() {
    const R = S.salesnavSearch;
    const root = firstElRaw(R.root) || document.body;
    const seen = new Map();
    for (const link of root.querySelectorAll(R.leadLink)) {
      const salesnavId = U.extractSalesNavId(link.href);
      if (!salesnavId) continue;
      const card = closestCard(link, R.card, false);
      if (!card || seen.has(card)) continue;
      const nameEl = link.matches(R.name.join(',')) ? link : firstEl(R.name, link) || firstEl(R.name, card);
      const name = cleanName(textOf(nameEl) || textOf(link));
      if (!name) continue;
      seen.set(card, { card, anchor: nameEl || link, salesnavId, name, company: firstText(R.company, card) });
    }
    return [...seen.values()];
  }

  // Élément après lequel placer le badge sur une page profil / fiche lead.
  function profileNameElement() {
    const type = U.pageType(location.href);
    if (type === 'profile') {
      const sem = fromSemantic();
      if (sem.nameEl) return sem.nameEl;
      const root = firstElRaw(S.profile.topCard) || document;
      return firstEl(S.profile.name, root) || firstEl(S.profile.name);
    }
    if (type === 'salesnav-lead') return firstEl(S.salesnavLead.name);
    if (type === 'salesnav-search') {
      const d = findSalesNavDrawer();
      return d ? d.nameEl : null;
    }
    return null;
  }

  // Diagnostic : plan texte de l'en-tête et de la section Expérience (balises,
  // liens, aria-label, textes), pour corriger selectors.js quand LinkedIn change.
  function diagnose() {
    const lines = [];
    const outline = (root, label, max) => {
      lines.push('### ' + label + (root ? '' : ' : introuvable'));
      if (!root) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let n = walker.currentNode; n && count < max; n = walker.nextNode()) {
        let depth = 0;
        for (let p = n.parentNode; p && p !== root; p = p.parentNode) depth++;
        const pad = ' '.repeat(Math.min(depth, 30));
        if (n.nodeType === 3) {
          const t = clean(n.data);
          if (t) { lines.push(pad + '"' + t.slice(0, 90) + '"' + (isHidden(n) ? ' [caché]' : '')); count++; }
        } else if (['A', 'BUTTON', 'H1', 'H2', 'H3', 'LI', 'SECTION', 'IMG'].includes(n.tagName) || n.id) {
          const attrs = [];
          if (n.id) attrs.push('#' + n.id);
          const href = n.getAttribute('href');
          if (href) attrs.push('href=' + href.replace(/^https:\/\/www\.linkedin\.com/, '').split('?')[0].slice(0, 80));
          for (const a of ['aria-label', 'alt', 'data-anonymize']) {
            if (n.getAttribute(a)) attrs.push(a + '=' + n.getAttribute(a).slice(0, 80));
          }
          lines.push(pad + '<' + n.tagName.toLowerCase() + (attrs.length ? ' ' + attrs.join(' ') : '') + '>');
          count++;
        }
      }
    };
    lines.push('URL : ' + location.pathname + ' · titre : ' + document.title);
    lines.push('Extraction : ' + JSON.stringify(extractProfile()));
    const nameEl = profileNameElement();
    const top = nameEl && (nameEl.closest('section') || nameEl.parentElement);
    outline(top && top.parentElement ? top.parentElement : top, 'En-tête', 250);
    outline(U.pageType(location.href) === 'profile' ? experienceSection() : null, 'Expérience', 200);
    return lines.join('\n');
  }

  globalThis.AttioExtractor = {
    diagnose,
    extractProfile,
    extractSearchResults,
    extractSalesNavResults,
    profileNameElement
  };
})();
