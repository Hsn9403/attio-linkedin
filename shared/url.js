// Normalisation des URL LinkedIn.
// Chargé à la fois comme content script (script classique) et importé par le
// service worker (module) : on expose donc tout via globalThis.
(function () {
  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (_) { return s; }
  }

  function toUrl(input) {
    if (!input) return null;
    let s = String(input).trim();
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    try { return new URL(s); } catch (_) { return null; }
  }

  // "https://www.LinkedIn.com/in/Jean-Dupont/?utm=x" -> "jean-dupont"
  function extractHandle(input) {
    const u = toUrl(input);
    if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)/i);
    return m ? safeDecode(m[1]).toLowerCase() : null;
  }

  // Forme canonique stockée dans Attio : minuscules, sans slash final, sans paramètres.
  function normalizeProfileUrl(input) {
    const handle = extractHandle(input);
    return handle ? 'https://www.linkedin.com/in/' + handle : null;
  }

  // "/sales/lead/ACwAAA123,NAME_SEARCH,abcd" -> "ACwAAA123" (sensible à la casse, on ne la change pas)
  function extractSalesNavId(input) {
    const u = toUrl(input);
    if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/sales\/(?:lead|people)\/([^/,?#]+)/i);
    return m ? safeDecode(m[1]) : null;
  }

  // "/company/acme-sas/about/" ou "/sales/company/12345" -> "acme-sas" / "12345".
  // Sales Nav utilise l'identifiant numérique, que LinkedIn accepte aussi dans /company/<id>.
  function extractCompanySlug(input) {
    const u = toUrl(input);
    if (!u || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:sales\/)?company\/([^/,?#]+)/i);
    return m ? safeDecode(m[1]).toLowerCase() : null;
  }

  function normalizeCompanyUrl(input) {
    const slug = extractCompanySlug(input);
    return slug ? 'https://www.linkedin.com/company/' + slug : null;
  }

  function pageType(input) {
    const u = toUrl(input);
    if (!u) return 'other';
    const p = u.pathname;
    if (/^\/in\/[^/]+\/?$/i.test(p)) return 'profile';
    if (/^\/sales\/lead\//i.test(p)) return 'salesnav-lead';
    if (/^\/search\/results\//i.test(p)) return 'search';
    if (/^\/sales\/search\//i.test(p) || /^\/sales\/lists\/people/i.test(p)) return 'salesnav-search';
    return 'other';
  }

  globalThis.AttioUrl = {
    extractHandle, normalizeProfileUrl, extractSalesNavId,
    extractCompanySlug, normalizeCompanyUrl, pageType
  };
})();
