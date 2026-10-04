// Conversion entre la localisation texte de LinkedIn ("Paris, Île-de-France, France")
// et l'attribut Location d'Attio (objet dont les 10 clés sont obligatoires en écriture).
(function () {
  const COUNTRIES = {
    FR: ['france'],
    BE: ['belgique', 'belgium', 'belgië'],
    CH: ['suisse', 'switzerland', 'schweiz'],
    LU: ['luxembourg'],
    MC: ['monaco'],
    DE: ['allemagne', 'germany', 'deutschland'],
    GB: ['royaume-uni', 'united kingdom', 'uk', 'england', 'angleterre'],
    IE: ['irlande', 'ireland'],
    NL: ['pays-bas', 'netherlands', 'nederland'],
    ES: ['espagne', 'spain', 'españa'],
    PT: ['portugal'],
    IT: ['italie', 'italy', 'italia'],
    AT: ['autriche', 'austria'],
    SE: ['suède', 'sweden'],
    NO: ['norvège', 'norway'],
    DK: ['danemark', 'denmark'],
    FI: ['finlande', 'finland'],
    PL: ['pologne', 'poland'],
    CZ: ['tchéquie', 'czechia', 'czech republic', 'république tchèque'],
    GR: ['grèce', 'greece'],
    US: ['états-unis', 'etats-unis', 'united states', 'usa', 'united states of america'],
    CA: ['canada'],
    MX: ['mexique', 'mexico'],
    BR: ['brésil', 'brazil', 'brasil'],
    AR: ['argentine', 'argentina'],
    CL: ['chili', 'chile'],
    CO: ['colombie', 'colombia'],
    AE: ['émirats arabes unis', 'united arab emirates', 'uae'],
    SA: ['arabie saoudite', 'saudi arabia'],
    QA: ['qatar'],
    IL: ['israël', 'israel'],
    LB: ['liban', 'lebanon'],
    JO: ['jordanie', 'jordan'],
    KW: ['koweït', 'kuwait'],
    BH: ['bahreïn', 'bahrain'],
    OM: ['oman'],
    RO: ['roumanie', 'romania'],
    HU: ['hongrie', 'hungary'],
    UA: ['ukraine'],
    BG: ['bulgarie', 'bulgaria'],
    HR: ['croatie', 'croatia'],
    EE: ['estonie', 'estonia'],
    LT: ['lituanie', 'lithuania'],
    LV: ['lettonie', 'latvia'],
    CY: ['chypre', 'cyprus'],
    MT: ['malte', 'malta'],
    IS: ['islande', 'iceland'],
    KE: ['kenya'],
    GH: ['ghana'],
    CM: ['cameroun', 'cameroon'],
    MU: ['maurice', 'mauritius', 'île maurice'],
    PE: ['pérou', 'peru'],
    TH: ['thaïlande', 'thailand'],
    VN: ['vietnam', 'viêt nam'],
    ID: ['indonésie', 'indonesia'],
    MY: ['malaisie', 'malaysia'],
    PH: ['philippines'],
    TW: ['taïwan', 'taiwan'],
    TR: ['turquie', 'turkey', 'türkiye'],
    MA: ['maroc', 'morocco'],
    TN: ['tunisie', 'tunisia'],
    DZ: ['algérie', 'algeria'],
    SN: ['sénégal', 'senegal'],
    CI: ["côte d'ivoire", 'ivory coast'],
    ZA: ['afrique du sud', 'south africa'],
    NG: ['nigeria'],
    EG: ['égypte', 'egypt'],
    IN: ['inde', 'india'],
    CN: ['chine', 'china'],
    HK: ['hong kong', 'hong kong sar'],
    SG: ['singapour', 'singapore'],
    JP: ['japon', 'japan'],
    KR: ['corée du sud', 'south korea'],
    AU: ['australie', 'australia'],
    NZ: ['nouvelle-zélande', 'new zealand']
  };

  const NAME_TO_CODE = {};
  for (const [code, names] of Object.entries(COUNTRIES)) {
    for (const n of names) NAME_TO_CODE[n] = code;
  }

  function countryCode(name) {
    if (!name) return null;
    return NAME_TO_CODE[name.trim().toLowerCase()] || null;
  }

  function countryName(code) {
    if (!code) return '';
    const names = COUNTRIES[code.toUpperCase()];
    if (!names) return code.toUpperCase();
    const n = names[0];
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // "Paris, Île-de-France, France" -> { locality, region, country_code }
  function parseLocation(text) {
    const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
    const out = { locality: null, region: null, country_code: null };
    if (!parts.length) return out;
    const last = countryCode(parts[parts.length - 1]);
    if (last) {
      out.country_code = last;
      parts.pop();
    }
    if (parts.length >= 2) {
      out.locality = parts[0];
      out.region = parts.slice(1).join(', ');
    } else if (parts.length === 1) {
      out.locality = parts[0];
    }
    return out;
  }

  function toAttioLocation(text) {
    const p = parseLocation(text);
    return {
      line_1: null,
      line_2: null,
      line_3: null,
      line_4: null,
      locality: p.locality,
      region: p.region,
      postcode: null,
      country_code: p.country_code,
      latitude: null,
      longitude: null
    };
  }

  function formatAttioLocation(v) {
    if (!v) return '';
    return [v.locality, v.region, countryName(v.country_code)].filter(Boolean).join(', ');
  }

  // Clé de comparaison tolérante (casse, accents, langue du pays).
  function locationKey(parts) {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return [norm(parts.locality), norm(parts.region), (parts.country_code || '').toUpperCase()].join('|');
  }

  globalThis.AttioLocation = { parseLocation, toAttioLocation, formatAttioLocation, locationKey };
})();
