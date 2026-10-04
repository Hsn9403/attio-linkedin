# LinkedIn → Attio (compatible Arc)

Extension Chromium (Manifest V3) qui :

- ajoute un profil LinkedIn ou Sales Navigator à Attio en un clic, via un popup pré-rempli et modifiable ;
- affiche directement sur LinkedIn si une personne est déjà dans le CRM, sur les profils comme dans les résultats de recherche.

Elle n'utilise **pas** l'API `chrome.sidePanel`, ce qui lui permet de fonctionner sur Arc. L'interface passe par le popup de l'icône et par des badges injectés dans la page.

> **Projet non officiel**, sans lien avec Attio ni LinkedIn, qui ne l'approuvent pas. Attio et LinkedIn sont des marques de leurs propriétaires respectifs. L'utilisation de l'extension doit respecter les [conditions d'utilisation de LinkedIn](https://www.linkedin.com/legal/user-agreement) et se fait sous la seule responsabilité de l'utilisateur.

## Démarrage rapide

1. Cloner le repo et le charger comme extension non empaquetée (§1).
2. Créer **votre propre token** Attio (§2) et le coller dans la page d'options, qui s'ouvre toute seule à l'installation.
3. Créer les deux attributs personnalisés dans votre workspace Attio (§3).
4. Cliquer sur **Tester la connexion** : la page indique ce qui manque, le cas échéant.

Aucun token ni workspace n'est inclus dans le code. Chaque utilisateur connecte son propre compte Attio.

---

## 1. Installation sur Arc

1. Cloner le repo (`git clone …`) ou télécharger le ZIP, et ne plus déplacer le dossier ensuite : Arc charge l'extension depuis cet emplacement.
   Sur macOS, évitez `~/Documents`, `~/Desktop` et `~/Downloads`, dont l'accès peut être bloqué par les réglages de confidentialité. Préférez par exemple `~/Developer/`.
2. Dans Arc, ouvrir `arc://extensions`.
3. Activer le **Mode développeur** (interrupteur en haut à droite).
4. Cliquer sur **Load unpacked** (« Charger l'extension non empaquetée ») et sélectionner le dossier `attio-linkedin/`.
5. La page d'options s'ouvre automatiquement. Sinon : clic droit sur l'icône → Options.
6. Pour afficher l'icône en permanence : menu Extensions d'Arc → épingler « LinkedIn → Attio ».
7. **Recharger les onglets LinkedIn déjà ouverts** (⌘R).

Mise à jour du code : `arc://extensions` → bouton ↻ sur l'extension, puis recharger LinkedIn.

La même procédure fonctionne sur Chrome, Brave et Edge, via `chrome://extensions`.

## 2. Créer le token Attio

1. Attio → **Settings** → **Developers** → **Create a new integration** (par exemple « LinkedIn Extension »).
2. Dans l'intégration, régler les **scopes** :
   | Scope | Niveau | Usage |
   |---|---|---|
   | `record_permission` | Read-write | chercher, créer et mettre à jour les personnes et entreprises |
   | `object_configuration` | Read | vérifier que les attributs existent |
   | `note` | Read-write | ajouter la note libre |
3. Copier l'**Access token**, le coller dans les options de l'extension, puis cliquer sur **Tester la connexion**.
   Le test affiche le workspace, les scopes manquants et l'état des attributs personnalisés.

Le token est stocké dans `chrome.storage.local` (local à ce navigateur, jamais synchronisé). Il ne sert qu'au service worker de l'extension, pour les appels à `api.attio.com`.

## 3. Attributs à créer dans Attio

Dans Attio → **Settings** → **Objects** → **People** → **Attributes** → **+ Create attribute** :

| Nom affiché | Slug (API) | Type | Options |
|---|---|---|---|
| Type de contact | `contact_type` | **Select** (choix unique ou multiple) | au choix, par exemple `Prospect`, `Client`, `Partenaire` |
| ID Sales Navigator | `salesnav_id` | **Text** | — |

- Les options du type de contact sont lues directement dans Attio : le menu du popup affiche celles de l'attribut. Pour en ajouter ou en retirer, il suffit de modifier l'attribut dans Attio.
- Les slugs sont modifiables dans les options de l'extension si les attributs existent déjà sous un autre nom.
- Si un attribut manque, l'extension ne plante pas. Elle enregistre le reste et affiche comment créer l'attribut manquant.

Les attributs standards utilisés n'ont rien à créer : `name`, `job_title`, `company` (lien vers Companies), `primary_location` et `linkedin`. Pour les entreprises, seul `name` est utilisé.

## 4. Fonctionnement

### Capture (popup)
1. Sur un profil `linkedin.com/in/…` ou une fiche `linkedin.com/sales/lead/…`, ouvrir le formulaire de l'une de ces trois façons :
   - le bouton **＋ Ajouter** ou **Mettre à jour** du badge à côté du nom ;
   - le raccourci **⌥⇧A** (modifiable dans `arc://extensions/shortcuts`) ;
   - l'icône de l'extension.
2. Le formulaire est pré-rempli : prénom, nom, titre, entreprise, localisation, URL, ainsi que l'ID Sales Nav sur une fiche lead.
3. Choisir un type de contact, ajouter éventuellement une note, puis cliquer sur **Ajouter à Attio**.

Le **titre** pré-rempli est le poste le plus récent : section Expérience sur LinkedIn, « Postes actuels » sur Sales Navigator. Si cette section n'est pas encore chargée, on se rabat sur le sous-titre du profil.

Règles d'écriture :
- **Recherche du doublon** : d'abord par URL LinkedIn normalisée (`https://www.linkedin.com/in/<handle>`, en minuscules, sans slash final ni paramètres), puis par ID Sales Navigator.
- **Personne absente** : la fiche est créée.
- **Entreprise** : elle est retrouvée d'abord par l'URL de sa page LinkedIn (attribut standard `linkedin` des Companies), puis par nom exact, et créée sinon. Si elle est retrouvée par nom et que son URL LinkedIn est vide, l'URL est complétée. L'URL n'est utilisée que si le nom de l'entreprise n'a pas été modifié dans le popup.
- **Personne déjà présente** :
  - seuls les champs **vides** dans Attio sont remplis ;
  - si le titre, l'entreprise ou la localisation diffèrent, le popup affiche **Attio | LinkedIn** côte à côte, avec une case **Remplacer** décochée par défaut ;
  - le **nom n'est jamais modifié** ;
  - le type de contact est pré-sélectionné avec la valeur Attio, et n'est écrit que si tu le changes.
- **Note** : ajoutée comme note Attio, en texte brut, sur la fiche de la personne.
- **Homonyme** : si aucun doublon exact n'est trouvé mais qu'une fiche porte le même nom, le popup la signale avant la création.

### Badges
| Badge | Signification |
|---|---|
| 🟢 **Dans Attio · ajouté le JJ/MM/AAAA** | correspondance exacte par URL LinkedIn ou ID Sales Nav. Le lien ouvre la fiche. |
| 🟠 **Probablement dans Attio** | Sales Nav : même nom **et** même entreprise |
| 🟠 **Probablement dans Attio · homonyme possible** | Sales Nav : même nom, mais l'entreprise diffère ou n'est pas visible |
| ⚪ **Pas dans Attio** | aucune fiche trouvée |

- Les badges apparaissent sur les profils, les fiches lead, les recherches LinkedIn (`/search/results/…`) et les recherches ou listes Sales Navigator.
- Les résultats visibles sont vérifiés **en une seule requête groupée**, puis gardés en cache 10 minutes. Le cache est vidé après chaque ajout et à chaque changement de réglage.
- La date affichée est la date de création de la fiche dans Attio (`created_at`), pas celle de l'ajout via l'extension.

## 5. Garanties

- **Aucune action automatique sur LinkedIn** : pas de crawl, pas de pagination, pas de clic simulé. L'extension lit uniquement ce qui est affiché.
- **Écriture dans Attio uniquement après un clic** sur « Ajouter à Attio ».
- **Tous les appels Attio passent par le service worker**, jamais par le content script.
- **Permissions minimales** : `storage`, `activeTab`, et des accès limités à `www.linkedin.com` et `api.attio.com`.

## 6. Limites connues

- **DOM LinkedIn** : LinkedIn modifie régulièrement ses pages. Si un champ n'est plus détecté, il suffit de corriger `content/selectors.js`, le seul fichier concerné, puis de recharger l'extension. Tous les champs restent modifiables à la main dans le popup.
- **Sales Navigator** :
  - l'URL d'un lead contient un identifiant chiffré, pas l'URL publique ;
  - sans ID Sales Nav enregistré, la correspondance se fait par nom (badge orange), ce qui est moins fiable ;
  - le lien vers le profil public n'est récupéré que s'il est déjà présent dans la page, car l'extension ne clique jamais sur « Voir le profil LinkedIn » ;
  - une personne capturée depuis Sales Nav sans URL publique sera en doublon si elle est capturée plus tard depuis son profil LinkedIn : ajouter l'URL à la main dans le popup si besoin.
- **Fiches existantes avec une URL non standard** : la recherche utilise `contient /in/<handle>`, ce qui tolère les variantes (sans `www`, avec un slash final…). Les URL de type `/in/ACoAAB…` (identifiant interne) ou les handles encodés différemment ne sont pas reconnus.
- **Entreprise** : le rattachement se fait par l'URL de la page LinkedIn de l'entreprise, sinon par nom exact.
  - Sales Navigator utilise l'identifiant numérique (`/company/12345`), alors que LinkedIn utilise souvent un nom (`/company/acme`). Une même entreprise vue des deux côtés est donc rattachée par nom.
  - Sans lien vers la page de l'entreprise, « Acme » et « Acme SAS » restent deux fiches différentes.
- **Localisation** : convertie en ville, région et code pays ISO. Le code pays n'est reconnu que pour une cinquantaine de pays (liste dans `shared/location.js`). Pour les autres, il reste vide.
- **Nom** : les émojis, les parenthèses et les certifications (« , CFA ») sont retirés. Le découpage prénom/nom se fait au premier espace, à corriger dans le popup si besoin (noms composés).
- **Onglets ouverts avant l'installation** : les recharger.
- **Rate limit Attio** (100 lectures/s, 25 écritures/s) : un 429 est réessayé automatiquement, puis un message s'affiche.

## 7. Arborescence

```
manifest.json
background/   service-worker.js (routeur), attio-client.js (HTTP + erreurs),
              crm.js (recherche, badges, capture), cache.js (TTL 10 min)
content/      selectors.js (tous les sélecteurs), extractor.js, badges.js, badges.css
popup/        formulaire de capture
options/      token + slugs des attributs
shared/       url.js (normalisation), location.js, constants.js
```

Endpoints Attio v2 utilisés : `GET /self`, `POST /objects/{people|companies}/records/query`, `POST /objects/{object}/records`, `PATCH /objects/people/records/{id}`, `GET /objects/companies/records/{id}`, `GET /objects/people/attributes/{slug}`, `GET …/attributes/{slug}/options`, `POST /notes`.

## Licence

MIT, voir [LICENSE](LICENSE).
