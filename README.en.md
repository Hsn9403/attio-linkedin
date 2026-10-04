# LinkedIn → Attio (Arc compatible)

[Français](README.md) · **English**

Chromium extension (Manifest V3) that:

- adds a LinkedIn or Sales Navigator profile to Attio in one click, through a pre-filled, editable popup;
- shows directly on LinkedIn whether a person is already in the CRM, on profiles as well as in search results.

It does **not** use the `chrome.sidePanel` API, which is why it works in Arc. The interface relies on the toolbar popup and on badges injected into the page.

> **Unofficial project**, not affiliated with or endorsed by Attio or LinkedIn. Attio and LinkedIn are trademarks of their respective owners. Use of this extension must comply with the [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) and is at the user's sole responsibility.

> **Note:** the extension's interface is in French. Button labels are quoted below in French, with their English meaning in parentheses.

## Quick start

1. Clone the repo and load it as an unpacked extension (§1).
2. Create **your own** Attio token (§2) and paste it into the options page, which opens automatically on install.
3. Create the two custom attributes in your Attio workspace (§3).
4. Click **Tester la connexion** (Test connection): the page tells you what is missing, if anything.

No token or workspace is included in the code. Each user connects their own Attio account.

---

## 1. Installing in Arc

1. Clone the repo (`git clone …`) or download the ZIP, then leave the folder where it is: Arc loads the extension from that location.
   On macOS, avoid `~/Documents`, `~/Desktop` and `~/Downloads`, as privacy settings may block access to them. Use `~/Developer/`, for example.
2. In Arc, open `arc://extensions`.
3. Turn on **Developer mode** (toggle at the top right).
4. Click **Load unpacked** and select the `attio-linkedin/` folder.
5. The options page opens automatically. If it does not: right-click the icon → Options.
6. To keep the icon visible: Arc's Extensions menu → pin "LinkedIn → Attio".
7. **Reload any LinkedIn tabs that were already open** (⌘R).

Updating the code: `arc://extensions` → ↻ button on the extension, then reload LinkedIn.

The same steps work in Chrome, Brave and Edge, via `chrome://extensions`.

## 2. Creating the Attio token

1. Attio → **Settings** → **Developers** → **Create a new integration** (for example "LinkedIn Extension").
2. In the integration, set the **scopes**:
   | Scope | Level | Used for |
   |---|---|---|
   | `record_permission` | Read-write | searching, creating and updating people and companies |
   | `object_configuration` | Read | checking that the attributes exist |
   | `note` | Read-write | adding the free-text note |
3. Copy the **Access token**, paste it into the extension's options, then click **Tester la connexion** (Test connection).
   The test shows the workspace, any missing scopes and the status of the custom attributes.

The token is stored in `chrome.storage.local` (local to this browser, never synced). It is only used by the extension's service worker, for calls to `api.attio.com`.

## 3. Attributes to create in Attio

In Attio → **Settings** → **Objects** → **People** → **Attributes** → **+ Create attribute**:

| Display name | Slug (API) | Type | Options |
|---|---|---|---|
| Contact type | `contact_type` | **Select** (single or multiple) | your choice, for example `Prospect`, `Customer`, `Partner` |
| Sales Navigator ID | `salesnav_id` | **Text** | |

- Contact type options are read directly from Attio: the popup menu lists the attribute's options. To add or remove one, just edit the attribute in Attio.
- Slugs can be changed in the extension's options if the attributes already exist under another name.
- If an attribute is missing, the extension does not break. It saves everything else and explains how to create the missing attribute.

The standard attributes used need no setup: `name`, `job_title`, `company` (link to Companies), `primary_location` and `linkedin`. For companies, only `name` is used.

## 4. How it works

### Capture (popup)
1. On a `linkedin.com/in/…` profile or a `linkedin.com/sales/lead/…` lead page, open the form in one of three ways:
   - the **＋ Ajouter** (Add) or **Mettre à jour** (Update) button on the badge next to the name;
   - the **⌥⇧A** shortcut (configurable in `arc://extensions/shortcuts`);
   - the extension icon.
2. The form is pre-filled: first name, last name, title, company, location, URL, plus the Sales Nav ID on a lead page.
3. Pick a contact type, optionally add a note, then click **Ajouter à Attio** (Add to Attio).

The pre-filled **title** is the most recent position: Experience section on LinkedIn, "Current positions" on Sales Navigator. If that section has not loaded yet, the profile headline is used instead.

Write rules:
- **Duplicate lookup**: first by normalized LinkedIn URL (`https://www.linkedin.com/in/<handle>`, lowercase, no trailing slash or query parameters), then by Sales Navigator ID.
- **Person not found**: the record is created.
- **Company**: matched first by its LinkedIn page URL (standard `linkedin` attribute on Companies), then by exact name, and created otherwise. If matched by name and its LinkedIn URL is empty, the URL is filled in. The URL is only used if the company name was not edited in the popup.
- **Person already exists**:
  - only fields that are **empty** in Attio are filled;
  - if the title, company or location differ, the popup shows **Attio | LinkedIn** side by side, with a **Remplacer** (Replace) checkbox unchecked by default;
  - the **name is never changed**;
  - the contact type is preselected with the Attio value, and is only written if you change it.
- **Note**: added as a plain-text Attio note on the person's record.
- **Namesake**: if no exact duplicate is found but a record has the same name, the popup flags it before creating anything.

### Badges
| Badge | Meaning |
|---|---|
| 🟢 **Dans Attio · ajouté le DD/MM/YYYY** (In Attio · added on) | exact match by LinkedIn URL or Sales Nav ID. The link opens the record. |
| 🟠 **Probablement dans Attio** (Probably in Attio) | Sales Nav: same name **and** same company |
| 🟠 **Probablement dans Attio · homonyme possible** (possible namesake) | Sales Nav: same name, but the company differs or is not visible |
| ⚪ **Pas dans Attio** (Not in Attio) | no record found |

- Badges appear on profiles, lead pages, LinkedIn searches (`/search/results/…`) and Sales Navigator searches or lists.
- Visible results are checked **in a single batched request**, then cached for 10 minutes. The cache is cleared after each capture and whenever settings change.
- The date shown is the record's creation date in Attio (`created_at`), not the date it was added through the extension.

## 5. Guarantees

- **No automated actions on LinkedIn**: no crawling, no pagination, no simulated clicks. The extension only reads what is displayed.
- **Nothing is written to Attio without a click** on "Ajouter à Attio".
- **All Attio calls go through the service worker**, never through the content script.
- **Minimal permissions**: `storage`, `activeTab`, and host access limited to `www.linkedin.com` and `api.attio.com`.

## 6. Known limitations

- **LinkedIn DOM**: LinkedIn changes its pages regularly. If a field is no longer detected, fix `content/selectors.js` (the only file involved), then reload the extension. All fields remain editable by hand in the popup.
- **Sales Navigator**:
  - a lead URL contains an encrypted identifier, not the public URL;
  - without a stored Sales Nav ID, matching is done by name (orange badge), which is less reliable;
  - the public profile link is only picked up if it is already present in the page, since the extension never clicks "View LinkedIn profile";
  - a person captured from Sales Nav without a public URL will be duplicated if captured later from their LinkedIn profile: add the URL by hand in the popup if needed.
- **Existing records with a non-standard URL**: the search uses `contains /in/<handle>`, which tolerates variants (no `www`, trailing slash…). URLs of the `/in/ACoAAB…` form (internal identifier) or differently encoded handles are not recognized.
- **Company**: matched by the company's LinkedIn page URL, otherwise by exact name.
  - Sales Navigator uses the numeric identifier (`/company/12345`), while LinkedIn often uses a name (`/company/acme`). The same company seen from both sides is therefore matched by name.
  - Without a link to the company page, "Acme" and "Acme Inc" remain two separate records.
- **Location**: converted into city, region and ISO country code. The country code is only recognized for about fifty countries (list in `shared/location.js`). For others, it stays empty.
- **Name**: emojis, parentheses and certifications (", CFA") are stripped. First/last name is split at the first space; correct it in the popup if needed (compound names).
- **Tabs opened before installation**: reload them.
- **Attio rate limit** (100 reads/s, 25 writes/s): a 429 is retried automatically, then a message is shown.

## 7. Project structure

```
manifest.json
background/   service-worker.js (router), attio-client.js (HTTP + errors),
              crm.js (search, badges, capture), cache.js (10 min TTL)
content/      selectors.js (all selectors), extractor.js, badges.js, badges.css
popup/        capture form
options/      token + attribute slugs
shared/       url.js (normalization), location.js, constants.js
```

Attio v2 endpoints used: `GET /self`, `POST /objects/{people|companies}/records/query`, `POST /objects/{object}/records`, `PATCH /objects/people/records/{id}`, `GET /objects/companies/records/{id}`, `GET /objects/people/attributes/{slug}`, `GET …/attributes/{slug}/options`, `POST /notes`.

## License

MIT, see [LICENSE](LICENSE).
