(() => {
  "use strict";
  if (globalThis.EbayUI?.register) return;
  const registry = Object.create(null);
  const api = {
    version: "8.23.21",
    register(name, value) {
      const key = String(name || "").trim();
      if (!key) throw new Error("UI container name is required.");
      if (registry[key]) throw new Error(`UI container already registered: ${key}`);
      const frozen = Object.freeze({ ...(value || {}) });
      registry[key] = frozen;
      Object.defineProperty(api, key, { value: frozen, enumerable: true, configurable: false, writable: false });
      return frozen;
    },
    has(name) { return Boolean(registry[String(name || "")]); }
  };
  globalThis.EbayUI = api;
})();
