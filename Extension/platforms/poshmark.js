/* Poshmark create-listing platform adapter — V8.23.21. */
(function initPoshmarkAdapterV8200(global) {
  "use strict";

  const dom = global.MarketplaceDomV8200;
  const registry = global.MarketplaceAdaptersV8200;
  if (!dom || !registry) return;
  const PLATFORM = "poshmark";
  function debug(message, error) { global.EbayLogger?.debug?.(`[${PLATFORM}] ${message}`, { message: error?.message || String(error || "") }); }

  function root() { return document.getElementById("content") || document.body; }
  function supported() {
    return global.MarketplacePlatformV8200?.detect?.() === PLATFORM && Boolean(document.getElementById("img-file-input") || Array.from(document.querySelectorAll("h1")).some(node => /create listing/i.test(node.textContent || "")));
  }
  function isBlocked(label) { return global.EbayAiSafetyV790?.isBlockedField?.(label, PLATFORM) === true; }
  function sectionByTitle(title) {
    const wanted = dom.key(title);
    for (const section of Array.from(root()?.querySelectorAll?.(".listing-editor__subsection") || [])) {
      const heading = section.querySelector(".listing-editor__section__title");
      if (heading && dom.key(heading.textContent).replace(/\s+optional$/, "") === wanted) return section;
    }
    return null;
  }
  function visibleMenu(dropdown) { return Array.from(dropdown?.querySelectorAll?.(".dropdown__menu") || []).find(dom.visible) || null; }
  function genericOptionNodes(dropdown) {
    const menu = visibleMenu(dropdown) || dropdown;
    return Array.from(menu?.querySelectorAll?.(".dropdown__menu__item") || []).map(item => item.querySelector(".dropdown__link") || item).filter(Boolean);
  }
  function optionLabel(node) {
    const strong = node?.querySelector?.(".fw--med");
    return dom.clean(strong?.textContent || node?.textContent || node?.getAttribute?.("data-et-name") || "", 180);
  }
  function makeDropdownRecord({ label, resolveDropdown, order, type = "dropdown", maxValues = 1, optionNodes = genericOptionNodes, readValue = null, selectedValue = null, closeAction = null, customValueAllowed = false }) {
    let lastSelectionResult = {};
    const resolve = () => resolveDropdown?.() || null;
    const control = dropdown => dropdown?.querySelector?.('[data-test="dropdown-container"] .dropdown__selector,[data-test="size"]') || dropdown?.querySelector?.('[data-test="dropdown-container"]') || dropdown;
    const read = async () => {
      const dropdown = resolve();
      if (!dropdown) return "";
      if (readValue) return dom.clean(await readValue(dropdown), 240);
      const text = dom.clean(control(dropdown)?.textContent || "", 240);
      return /^(?:select|enter|add)\b/i.test(text) ? "" : text;
    };
    const readValues = async () => {
      if (type !== "multi") { const value = await read(); return value ? [value] : []; }
      const dropdown = resolve();
      const chosen = dom.readSelectedOptions(dropdown);
      const text = await read();
      if (text && !chosen.some(value => dom.same(value, text))) chosen.push(text);
      return dom.unique(chosen);
    };
    const open = async () => {
      const dropdown = resolve();
      if (!dropdown) return false;
      if (visibleMenu(dropdown) && optionNodes(dropdown).length) return true;
      dom.safeClick(control(dropdown));
      return dom.waitUntil(() => Boolean(visibleMenu(resolve())) || optionNodes(resolve()).length > 0, 900, 25);
    };
    const options = async () => dom.unique(optionNodes(resolve()).map(optionLabel).filter(Boolean));
    const isSelected = async value => {
      const wanted = dom.clean(value, 180);
      if (!wanted) return false;
      if (selectedValue) return Boolean(await selectedValue(resolve(), wanted));
      const current = await readValues();
      return current.some(item => dom.same(item, wanted));
    };
    const selectExact = async value => {
      const wanted = dom.clean(value, 180);
      lastSelectionResult = {};
      if (!wanted || await isSelected(wanted)) { lastSelectionResult = { kind: "exact", retryable: false }; return true; }
      if (!await open()) { lastSelectionResult = { code: "menu_open_failed", retryable: true }; return false; }
      const dropdown = resolve();
      let nodes = optionNodes(dropdown);
      let hit = nodes.find(node => dom.same(optionLabel(node), wanted));
      if (!hit) { lastSelectionResult = { code: "exact_option_not_found", retryable: false }; return false; }
      dom.safeClick(hit);
      const confirmed = await dom.waitUntil(() => isSelected(wanted), 950, 25);
      lastSelectionResult = confirmed ? { kind: "exact", retryable: false } : { code: "value_not_confirmed", retryable: true };
      return confirmed;
    };
    const close = async () => {
      const dropdown = resolve();
      if (!dropdown) return true;
      if (closeAction) { try { await closeAction(dropdown); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); } }
      if (visibleMenu(dropdown)) {
        try { control(dropdown)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); }
      }
      return true;
    };
    return {
      platform: PLATFORM, label, name: label, type, order, maxValues, control: control(resolve()), required: /\*/.test(sectionByTitle(label)?.querySelector?.(".listing-editor__section__title")?.textContent || ""), customValueAllowed,
      centerForFill: async () => { try { resolve()?.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); } return true; },
      refresh: async () => Boolean(resolve()?.isConnected), read, readValues, open, close, options, isSelected, selectExact,
      selectionOutcome: () => lastSelectionResult,
      get lastSelectionResult() { return lastSelectionResult; }
    };
  }

  function standardDropdown(label, order, resolveDropdown, options = {}) {
    return makeDropdownRecord({ label, order, resolveDropdown, ...options });
  }

  function brandRecord(order) {
    const resolveInput = () => document.querySelector('[data-et-name="listingEditorBrandSection"] input[placeholder*="Brand/Designer" i]');
    let lastSelectionResult = {};
    const read = async () => dom.clean(resolveInput()?.value || "", 120);
    const open = async () => { const input = resolveInput(); if (!input) return false; try { input.focus(); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); } dom.safeClick(input); return true; };
    const suggestions = () => Array.from(document.querySelectorAll('[data-et-name="listingEditorBrandSection"] .dropdown__menu__item')).filter(dom.visible);
    const options = async () => dom.unique(suggestions().map(optionLabel));
    const isSelected = async value => dom.same(await read(), value);
    const selectExact = async value => {
      const wanted = dom.clean(value, 120);
      lastSelectionResult = {};
      if (!wanted) return false;
      const input = resolveInput();
      if (!input) return false;
      if (await isSelected(wanted)) { lastSelectionResult = { kind: "exact", retryable: false }; return true; }
      dom.nativeSet(input, wanted, { blur: false });
      try { input.focus(); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); }
      await dom.waitUntil(() => suggestions().some(node => dom.same(optionLabel(node), wanted)), 900, 30);
      const hit = suggestions().find(node => dom.same(optionLabel(node), wanted));
      if (hit) dom.safeClick(hit);
      const confirmed = await dom.waitUntil(() => isSelected(wanted), 800, 25);
      lastSelectionResult = confirmed ? { kind: hit ? "exact" : "custom", retryable: false } : { code: hit ? "value_not_confirmed" : "exact_option_not_found", retryable: !hit };
      return confirmed;
    };
    return { platform: PLATFORM, label: "Brand", name: "Brand", type: "dropdown", order, maxValues: 1, control: resolveInput(), required: false, customValueAllowed: true,
      centerForFill: async () => { try { resolveInput()?.scrollIntoView?.({ block: "center" }); } catch (error) { debug("Best-effort Poshmark DOM operation skipped", error); } return true; }, refresh: async () => Boolean(resolveInput()?.isConnected), read, readValues: async () => { const v=await read(); return v?[v]:[]; }, open, close: async()=>true, options, isSelected, selectExact, selectionOutcome:()=>lastSelectionResult, get lastSelectionResult(){return lastSelectionResult;} };
  }

  function colorRecord(order) {
    const section = () => sectionByTitle("Color");
    const dropdown = () => section()?.querySelector('[data-test="dropdown"]');
    const optionNodes = d => Array.from(d?.querySelectorAll?.("li.listing-editor__tile--color") || []).filter(dom.visible);
    const selectedValue = async (d, wanted) => {
      const node = optionNodes(d).find(item => dom.same(optionLabel(item), wanted));
      if (!node) return false;
      if (node.getAttribute("aria-selected") === "true" || node.querySelector('[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"]')) return true;
      if (/selected|active|checked/i.test(node.className || "")) return true;
      const selectorText = dom.clean(d?.querySelector?.('[data-test="dropdown-container"]')?.textContent || "", 240);
      return new RegExp(`(?:^|\\b)${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`, "i").test(selectorText) && !/select up to/i.test(selectorText);
    };
    return makeDropdownRecord({ label: "Color", order, resolveDropdown: dropdown, type: "multi", maxValues: 2, optionNodes, selectedValue,
      closeAction: async d => { const done = Array.from(d.querySelectorAll("button")).find(button => dom.same(button.textContent, "Done") && dom.visible(button)); if (done) dom.safeClick(done); } });
  }

  function styleTagsRecord(order) {
    const resolveInput = () => sectionByTitle("Style Tags")?.querySelector('input[data-vv-name="style-tag-input"]');
    const container = () => sectionByTitle("Style Tags")?.querySelector(".listing-editor__tags__container") || sectionByTitle("Style Tags");
    const optionNodes = () => Array.from(sectionByTitle("Style Tags")?.querySelectorAll?.('[data-et-on-name="style_tag"][data-et-name]') || []).filter(dom.visible);
    let lastSelectionResult = {};
    const readValues = async () => {
      const c = container();
      const tokens = Array.from(c?.querySelectorAll?.("[data-et-name],button,span") || []).map(node => dom.clean(node.textContent || "", 80)).filter(text => text && !/add up to 3 tags/i.test(text));
      return dom.unique(tokens).slice(0, 3);
    };
    const isSelected = async value => (await readValues()).some(item => dom.same(item, value));
    const selectExact = async value => {
      const wanted = dom.clean(value, 80); lastSelectionResult = {};
      if (!wanted || await isSelected(wanted)) { lastSelectionResult={kind:"exact",retryable:false}; return true; }
      const input=resolveInput(); if(!input) return false;
      dom.nativeSet(input,wanted,{blur:false}); try{input.focus();}catch(error){debug("Best-effort Poshmark DOM operation skipped",error);}
      await dom.waitUntil(()=>optionNodes().some(node=>dom.same(optionLabel(node),wanted)),600,25);
      const hit=optionNodes().find(node=>dom.same(optionLabel(node),wanted));
      if(hit) dom.safeClick(hit); else { try{input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));}catch(error){debug("Best-effort Poshmark DOM operation skipped",error);} }
      const ok=await dom.waitUntil(()=>isSelected(wanted),700,25);
      lastSelectionResult=ok?{kind:hit?"exact":"custom",retryable:false}:{code:"value_not_confirmed",retryable:true}; return ok;
    };
    return { platform:PLATFORM,label:"Style Tags",name:"Style Tags",type:"multi",order,maxValues:3,control:resolveInput(),required:false,customValueAllowed:true,
      centerForFill:async()=>{try{resolveInput()?.scrollIntoView?.({block:"center"});}catch(error){debug("Best-effort Poshmark DOM operation skipped",error);}return true;},refresh:async()=>Boolean(resolveInput()?.isConnected),read:async()=> (await readValues()).join(", "),readValues,open:async()=>{const i=resolveInput();if(!i)return false;try{i.focus();}catch(error){debug("Best-effort Poshmark DOM operation skipped",error);}dom.safeClick(i);return true;},close:async()=>true,options:async()=>dom.unique(optionNodes().map(optionLabel)),isSelected,selectExact,selectionOutcome:()=>lastSelectionResult,get lastSelectionResult(){return lastSelectionResult;} };
  }

  async function collectFieldMap() {
    const map = new Map();
    if (!supported()) return map;
    const records = [];
    const category = () => document.querySelector(".listing-editor__category-container [data-test='dropdown']");
    const subcategory = () => document.querySelector(".listing-editor__subcategory-container [data-test='dropdown']");
    const sizeDropdown = () => sectionByTitle("Size")?.querySelector('[data-test="dropdown"]');
    const conditionDropdown = () => sectionByTitle("condition")?.querySelector('[data-test="dropdown"]') || sectionByTitle("Condition")?.querySelector('[data-test="dropdown"]');
    records.push(standardDropdown("Category", 0, category));
    records.push(standardDropdown("Subcategory", 1, subcategory));
    records.push(standardDropdown("Size", 2, sizeDropdown));
    records.push(standardDropdown("Condition", 3, conditionDropdown));
    records.push(brandRecord(4));
    records.push(colorRecord(5));
    records.push(styleTagsRecord(6));
    for (const rec of records) {
      if (!rec || isBlocked(rec.label) || !await rec.refresh()) continue;
      const k = dom.key(rec.label); if (!map.has(k)) map.set(k, rec);
    }
    return map;
  }

  async function collectListing({ requirePhotos = false, photoLimit = 16 } = {}) {
    if (!supported()) return { ok:false,message:"Open Poshmark Create Listing first.",photos:[],routeQuestions:[],fields:[] };
    const fieldMap = await collectFieldMap();
    const fields=[]; const fieldSummary={};
    for(const rec of fieldMap.values()){
      const opts=await rec.options().catch(()=>[]); const currentValue=await rec.read().catch(()=>""); fieldSummary[rec.label]=currentValue;
      fields.push({name:rec.label,label:rec.label,type:rec.type,currentValue,options:opts,required:rec.required===true,customValueAllowed:rec.customValueAllowed===true,maxValues:rec.maxValues,maxPromptOptions:dom.key(rec.label)==="category"?120:dom.key(rec.label)==="style tags"?120:80});
    }
    const questions=fields.filter(field=>global.EbayAiItemSpecificsV7100?.automaticDecision?.(field)?.allow!==false).map(field=>field.name);
    const photoSection=sectionByTitle("Photos & Video")?.closest?.("section") || root();
    const photos=await dom.collectPhotos({fileInput:document.getElementById("img-file-input"),root:photoSection,platform:PLATFORM,max:Math.max(1,Math.min(Number(photoLimit||16),16))});
    const category=[fieldSummary.Category,fieldSummary.Subcategory].filter(Boolean).join(" > ");
    return {ok:!requirePhotos||photos.length>0,message:(!requirePhotos||photos.length)?`Poshmark listing ready: ${photos.length} photo(s), ${questions.length} fillable field(s).`:"Transfer product photos to Poshmark first, then press Fill All.",platform:PLATFORM,platformLabel:"Poshmark",photos,routeQuestions:questions,fields,fieldMap,pageContext:{platform:PLATFORM,platformLabel:"Poshmark",url:location.href,pageTitle:document.title,category,currentTitle:"",fieldSummary,fields}};
  }

  function fieldSignature(){ return ["Category","Subcategory","Size","Condition","Brand","Color","Style Tags"].map(name=>`${dom.key(name)}:${Boolean(sectionByTitle(name)||sectionByTitle(name.toLowerCase()))}`).join("|"); }
  async function waitForDynamicFields(before){ return dom.waitForSignatureChange(fieldSignature,before,1900); }
  async function closeOpenMenus(){ for(const menu of Array.from(root()?.querySelectorAll?.(".dropdown__menu")||[]).filter(dom.visible)){ try{menu.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true}));}catch(error){debug("Best-effort Poshmark DOM operation skipped",error);}} return {ok:true}; }

  registry.register(PLATFORM,Object.freeze({version:"8.23.21",platform:PLATFORM,supported,collectFieldMap,collectListing,fieldSignature,waitForDynamicFields,closeOpenMenus}));
})(globalThis);
