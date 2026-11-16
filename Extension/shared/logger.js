/* V8.23.21 — minimal structured logger. Never pass secrets or full API payloads here. */
(function initEbayLogger(global) {
  "use strict";
  const prefix = "[eBay AI]";
  function write(level, message, details) {
    const fn = console[level] || console.log;
    if (details === undefined) fn.call(console, prefix, message);
    else fn.call(console, prefix, message, details);
  }
  global.EbayLogger = Object.freeze({
    debug: (m,d) => write("debug",m,d),
    info: (m,d) => write("info",m,d),
    warn: (m,d) => write("warn",m,d),
    error: (m,d) => write("error",m,d)
  });
})(globalThis);
