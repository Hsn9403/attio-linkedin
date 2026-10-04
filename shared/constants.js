// Constantes partagées (popup, options, service worker).
(function () {
  globalThis.AttioConst = {
    API_BASE: 'https://api.attio.com/v2',
    CACHE_TTL_MS: 10 * 60 * 1000,
    DEFAULT_SETTINGS: {
      token: '',
      contactTypeSlug: 'contact_type',
      salesnavIdSlug: 'salesnav_id'
    },
    REQUIRED_SCOPES: [
      'record_permission:read-write',
      'object_configuration:read',
      'note:read-write'
    ]
  };
})();
