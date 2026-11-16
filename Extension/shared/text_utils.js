/* V8.23.21 shared deterministic text normalization. */
function normalize(text) { return String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase(); }
function clean(value) { return String(value || "").replace(/^[-–—•\s]+/, "").replace(/^\$\s*/, "").trim(); }
