/* V8.23.21 diagnostics UI: rendering, clipboard, and download presentation only. */
function renderLogsDataV82310(logs = []) {
  const box=$("logBox"); if(!box) return;
  box.textContent=logs.length?logs.map(l=>`[${l.time}] ${l.message}${l.detail?`\n${l.detail}`:""}`).join("\n\n"):"No logs yet.";
}
function summarizeAnalysisRunsV82318(history = []) {
  const groups=new Map();
  for(const item of Array.isArray(history)?history:[]){
    if(item?.kind!=="api_request")continue;
    const runId=String(item.analysisRunId||"").trim();
    if(!runId)continue;
    const current=groups.get(runId)||{runId,createdAt:item.createdAt||item.updatedAt||"",requests:0,cost:0,costKnown:true,input:0,output:0,stages:[]};
    current.requests+=1;
    current.input+=Number(item.inputTokens||item.estimatedInputTokens||0);
    current.output+=Number(item.outputTokens||item.estimatedOutputTokens||0);
    if(item.costKnown===true)current.cost+=Number(item.cost||0);
    else {current.cost+=Number(item.estimatedCost||0);current.costKnown=false;}
    const stage=String(item.stage||"request"); if(!current.stages.includes(stage))current.stages.push(stage);
    const when=String(item.updatedAt||item.createdAt||""); if(when>String(current.createdAt||""))current.createdAt=when;
    groups.set(runId,current);
  }
  return [...groups.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12);
}
function renderUsageDataV82310(history = [], settings = {}, sum = {}) {
  const summaryBox=$("usageSummaryBox"), historyBox=$("usageHistoryBox"), budgetBox=$("budgetStatusBox");
  const dailyBudget=Number(settings.dailyBudget||0), monthlyBudget=Number(settings.monthlyBudget||0);
  const summary=[
    `Today ledger: ${money(sum.todayCost)} / ${dailyBudget?money(dailyBudget):"no limit"} • ${Number(sum.todayTokens||0).toLocaleString()} tokens • ${Number(sum.todayCount||0)} API request(s)`,
    `This month: ${money(sum.monthCost)} / ${monthlyBudget?money(monthlyBudget):"no limit"} • ${Number(sum.monthTokens||0).toLocaleString()} tokens • ${Number(sum.monthCount||0)} API request(s)`,
    `All API requests recorded: ${money(sum.totalCost)} • ${Number(sum.totalCount||0)} request(s)`,
    sum.todayUncertainCount?`Today includes ${sum.todayUncertainCount} request(s) with estimated/uncertain cost.`:`Today provider-usage entries have calculated cost when pricing is known.`
  ].join("\n");
  if(summaryBox) summaryBox.textContent=history.length?summary:"No API usage recorded yet.";
  if(budgetBox){const warnings=[];if(dailyBudget&&sum.todayCost>=dailyBudget)warnings.push("Daily budget reached. API analyze will stop until tomorrow or until you raise the limit.");else if(dailyBudget&&sum.todayCost>=dailyBudget*.8)warnings.push("Daily budget is over 80%.");if(monthlyBudget&&sum.monthCost>=monthlyBudget)warnings.push("Monthly budget reached. API analyze will stop until next month or until you raise the limit.");else if(monthlyBudget&&sum.monthCost>=monthlyBudget*.8)warnings.push("Monthly budget is over 80%.");budgetBox.textContent=`${summary}\n${warnings.length?`\nWarnings:\n${warnings.join("\n")}`:"\nBudget OK."}`;}
  if(historyBox){
    const requests=history.filter(x=>x?.kind!=="item_summary").slice(0,80);
    const runs=summarizeAnalysisRunsV82318(history);
    const runText=runs.length?`LATEST ANALYSIS RUNS (exact provider cost when known):\n${runs.map(run=>{const when=run.createdAt?new Date(run.createdAt).toLocaleString():"unknown";const cost=run.costKnown?money(run.cost):`~${money(run.cost)} uncertain`;return `[${when}] ${run.requests} API request(s) • ${run.stages.join(" + ")} • ${Number(run.input||0).toLocaleString()} in / ${Number(run.output||0).toLocaleString()} out • ${cost}`;}).join("\n")}\n\nREQUEST DETAILS:\n`:"";
    historyBox.textContent=requests.length?runText+requests.map(x=>{
      const when=new Date(x.createdAt).toLocaleString();
      if(x.kind==="api_request"){
        const cost=x.costKnown===true?money(x.cost||0):`~${money(x.estimatedCost||0)} uncertain`;
        const input=Number(x.inputTokens||x.estimatedInputTokens||0), cached=Number(x.cachedInputTokens||0), written=Number(x.cacheWriteTokens||0), output=Number(x.outputTokens||x.estimatedOutputTokens||0), reasoning=Number(x.reasoningTokens||0);
        const ids=[x.providerRequestId?`provider ${x.providerRequestId}`:"",x.clientRequestId?`client ${x.clientRequestId}`:""].filter(Boolean).join(" • ");
        const fields=(Array.isArray(x.questionNames)?x.questionNames:[]).filter(Boolean);
        const repairReasons=(Array.isArray(x.repairReasons)?x.repairReasons:[]).filter(Boolean);
        const fieldLine=fields.length?`\nFields: ${fields.join(", ")}`:"";
        const reasonLines=repairReasons.length?`\nRepair reasons:\n${repairReasons.map(item=>`- ${item.field||"field"}: ${item.code||"repair"}${item.reason?` — ${item.reason}`:""}`).join("\n")}`:"";
        const detailLine=Number(x.highDetailPhotoCount||0)>0?` (${Number(x.highDetailPhotoCount||0)} HIGH detail)`:"";
        return `[${when}] ${String(x.provider||"api").toUpperCase()} ${x.stage||"request"} — ${x.status||"unknown"}\nModel: ${x.model||"unknown"}; Photos: ${Number(x.photoCount||0)}${detailLine}; Cost: ${cost}\nTokens: ${input.toLocaleString()} in (${cached.toLocaleString()} cached, ${written.toLocaleString()} cache-write) / ${output.toLocaleString()} out (${reasoning.toLocaleString()} reasoning)${fieldLine}${reasonLines}${ids?`\nIDs: ${ids}`:""}`;
      }
      const title=x.title||"Legacy usage record", cost=money(x.cost||x.estimatedCost||0), toks=`${Number(x.inputTokens||x.estimatedInputTokens||0).toLocaleString()} in / ${Number(x.outputTokens||x.estimatedOutputTokens||0).toLocaleString()} out`;
      return `[${when}] ${title}\nLegacy record; Tokens: ${toks}; Cost: ${cost}`;
    }).join("\n\n"):"No API usage yet.";
  }

}
function renderDraftDataV82310(history = []) { const box=$("draftHistoryBox"); if(!box)return; box.textContent=history.length?history.map(x=>`[${new Date(x.createdAt).toLocaleString()}] ${x.status}\n${x.title}\nBrand: ${x.brand||"-"}; Size: ${x.size||"-"}; Price: ${x.price||"-"}\nPhotos: eBay ${x.photoCounts?.ebay||0}, upload ${x.photoCounts?.upload||0}, screenshot ${x.photoCounts?.screenshot||0}`).join("\n\n"):"No draft history yet."; }
function setDiagnosticsTextV82310(text){if($("diagnosticsBox")) $("diagnosticsBox").textContent=String(text||"");}
async function copyDiagnosticsTextV82310(text){await navigator.clipboard.writeText(String(text||""));}
function downloadDiagnosticsJsonV82310(filename,payload){downloadJsonFile(filename,payload);}
(() => {const ui=globalThis.EbayUI;if(ui?.register&&!ui.has?.("diagnostics"))ui.register("diagnostics",{renderLogs:renderLogsDataV82310,renderUsage:renderUsageDataV82310,renderDrafts:renderDraftDataV82310,setText:setDiagnosticsTextV82310,copyText:copyDiagnosticsTextV82310,downloadJson:downloadDiagnosticsJsonV82310});})();
