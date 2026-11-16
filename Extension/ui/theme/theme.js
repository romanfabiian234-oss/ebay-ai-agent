(() => {
  "use strict";
  const ui = globalThis.EbayUI;
  if (!ui?.register || ui.has?.("theme")) return;
  function applyTheme(mode = "light") {
    let theme = String(mode || "light");
    if (theme === "auto") theme = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
    if (theme !== "dark") theme = "light";
    document.documentElement.dataset.theme = theme;
    if (document.body) document.body.dataset.theme = theme;
    return theme;
  }
  ui.register("theme", { applyTheme });
})();
