// ============================================================================
// TOUS les sélecteurs LinkedIn / Sales Navigator sont ici.
// Quand LinkedIn change son DOM, c'est le seul fichier à modifier.
// Chaque champ a une liste ordonnée de sélecteurs : le premier qui renvoie
// un texte non vide gagne.
// ============================================================================
(function () {
  globalThis.AttioSelectors = {
    // ---- Page profil : linkedin.com/in/* --------------------------------
    profile: {
      // Conteneur de la carte d'en-tête (sert à restreindre les recherches).
      topCard: [
        'main section.artdeco-card:first-of-type',
        'main section[data-member-id]',
        'main .pv-top-card',
        'main section:first-of-type',
        'main'
      ],
      name: [
        'h1.text-heading-xlarge',
        'h1.inline.t-24',
        '.pv-top-card h1',
        'a[href*="/overlay/about-this-profile/"] h1',
        'h1'
      ],
      headline: [
        '.text-body-medium.break-words',
        '[data-generated-suggestion-target]',
        '.pv-top-card--list + .text-body-medium',
        'h1 ~ div.text-body-medium',
        'div.text-body-medium'
      ],
      location: [
        '.pv-text-details__left-panel + .mt2 span.text-body-small.inline',
        'span.text-body-small.inline.t-black--light.break-words',
        '.pv-top-card--list-bullet li.t-16',
        'span.text-body-small.inline'
      ],
      // Bouton « Entreprise actuelle » de la carte d'en-tête (aria-label, FR et EN).
      currentCompanyButton: [
        'button[aria-label^="Current company"]',
        'button[aria-label^="Entreprise actuelle"]',
        'a[aria-label^="Current company"]',
        'a[aria-label^="Entreprise actuelle"]'
      ],
      currentCompanyText: [
        '.pv-text-details__right-panel-item-text',
        'ul.pv-top-card--experience-list li:first-child span',
        'div[aria-label^="Current company"] span',
        'div[aria-label^="Entreprise actuelle"] span'
      ],
      // Premier poste de la section Expérience.
      experienceAnchor: ['#experience', 'div#experience'],
      // Titre de la section Expérience (repère sémantique si les classes changent).
      experienceHeading: /^(Expérience|Experience)$/i,
      // Ligne d'en-tête d'un groupe de postes : « CDI · 5 ans 3 mois », « 2 yrs 1 mo ».
      durationOnly: /^(?:[^·]{1,30}·\s*)?\d+\s*(an|ans|mois|yr|yrs|year|years|mo|mos|month|months)\b/i,
      employmentType: /^(CDI|CDD|Stage|Alternance|Apprentissage|Freelance|Indépendant|Temps plein|Temps partiel|Full-time|Part-time|Internship|Contract|Self-employed|Bénévolat)$/i,
      experienceNoise: /^(Ajouter|Add|Modifier|Edit|Afficher|Show|Voir|See)\b/i,
      experienceFirstCompany: [
        'li.artdeco-list__item span.t-14.t-normal span[aria-hidden="true"]',
        'li span.t-14.t-normal span[aria-hidden="true"]'
      ],
      canonical: ['link[rel="canonical"]', 'meta[property="og:url"]'],

      // --- Repères sémantiques (indépendants des classes CSS, plus stables) ---
      // Titre de l'onglet : "(3) Jane Doe | LinkedIn"
      titleCleanup: [/^\(\d+\+?\)\s*/, /\s*\|\s*LinkedIn.*$/i],
      // Lien « Coordonnées / Contact info » : la localisation est juste à côté.
      contactInfoLink: ['a[href*="/overlay/contact-info"]', 'a#top-card-text-details-contact-info'],
      // Lien entreprise dans la carte d'en-tête (le premier = poste actuel).
      companyLink: ['a[href*="/company/"]'],
      // Textes parasites de la carte d'en-tête.
      noiseText: /^(·\s*)?(1er|2e|3e(\s*et\s*\+)?|1st|2nd|3rd\+?|he\/him|she\/her|il\/lui|elle\/elle)$|^·$|^(Coordonnées|Contact info)$/i
    },

    // ---- Fiche lead Sales Navigator : linkedin.com/sales/lead/* ----------
    // Sales Nav expose des attributs data-anonymize, plus stables que les classes.
    salesnavLead: {
      name: [
        '[data-anonymize="person-name"]',
        'h1[data-x--lead--name]',
        'section[data-sn-view-name="lead-current-role"] ~ h1',
        'h1'
      ],
      headline: ['[data-anonymize="headline"]', '[data-anonymize="job-title"]'],
      jobTitle: ['[data-anonymize="job-title"]', '[data-anonymize="headline"]'],
      company: [
        '[data-anonymize="company-name"]',
        'a[data-view-name="lead-current-role-company-link"]',
        'a[href*="/sales/company/"]'
      ],
      location: ['[data-anonymize="location"]', '[data-x--lead--location]'],
      // Lien vers le profil public, s'il est déjà présent dans le DOM (sans cliquer).
      publicProfileLink: ['a[href*="linkedin.com/in/"]', 'a[href^="/in/"]'],
      // Liens vers une page entreprise (LinkedIn ou Sales Nav), pour le rattachement par URL.
      companyPageLink: 'a[href*="/company/"]',
      userOpenedOverlays: '[role="dialog"], [role="menu"], .artdeco-dropdown__content, .artdeco-modal',
      // Section « Postes actuels » : son premier poste sert de titre.
      currentRoleHeading: /^(Postes? actuels?|Current (roles?|positions?))$/i,
      // Fin d'une ligne de poste : la ligne suivante porte les dates.
      roleDateLine: /\b(19|20)\d{2}\b|Aujourd|Present|Today/i,
      roleCompanySeparator: /\s+(?:chez|at|@)\s+/i,
      // Repli localisation : texte court contenant un de ces mots, ou « Ville, …, Pays ».
      locationKeywords: /\b(Metropolitan|Area|Région|Region|Greater|Grand|Metro|Agglomération)\b/i
    },

    // ---- Résultats de recherche LinkedIn : /search/results/* ------------
    search: {
      // Racine où chercher les résultats.
      root: ['main', '.search-results-container', 'body'],
      // Liens vers un profil : un résultat = le conteneur le plus proche.
      profileLink: 'a[href*="linkedin.com/in/"], a[href^="/in/"]',
      card: [
        'li.reusable-search__result-container',
        'div[data-chameleon-result-urn]',
        'div[data-view-name="search-entity-result-universal-template"]',
        'li'
      ],
      // Nom visible dans le lien (LinkedIn duplique le texte pour les lecteurs d'écran).
      nameInLink: ['span[aria-hidden="true"]', 'span[dir="ltr"] > span[aria-hidden="true"]'],
      // Sous-titre « Titre chez Entreprise ».
      subtitle: [
        '.entity-result__primary-subtitle',
        'div.t-14.t-black.t-normal',
        '[data-view-name="search-entity-result-universal-template"] .t-14.t-black'
      ]
    },

    // ---- Résultats Sales Navigator : /sales/search/*, /sales/lists/people ----
    salesnavSearch: {
      root: ['main', '#search-results-container', 'body'],
      leadLink: 'a[href*="/sales/lead/"]',
      card: ['li.artdeco-list__item', 'div[data-x-search-result="LEAD"]', 'tr', 'li'],
      name: ['[data-anonymize="person-name"]'],
      company: ['[data-anonymize="company-name"]', 'a[href*="/sales/company/"]'],
      jobTitle: ['[data-anonymize="title"]', '[data-anonymize="job-title"]'],
      // Panneau latéral ouvert en cliquant sur un résultat : repéré comme un
      // nom de lead situé HORS d'une carte de résultat.
      drawerName: ['[data-anonymize="person-name"]'],
      drawerMaxDepth: 12
    },

    // ---- Données structurées (repli, surtout sur les pages publiques) ----
    meta: {
      ogTitle: 'meta[property="og:title"]',
      ogUrl: 'meta[property="og:url"]',
      description: 'meta[name="description"]',
      jsonLd: 'script[type="application/ld+json"]'
    },

    // Mots séparant le titre et l'entreprise dans un headline.
    headlineCompanySeparators: [' chez ', ' at ', ' @ ', ' @', ' bei ', ' en ', ' | ']
  };
})();
