from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / 'Extension/ui'


def req(value, message):
    if not value:
        raise AssertionError(message)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 900, 'height': 700})
    page.set_content('<main><footer id="status"></footer><span id="count"></span><div id="sources"></div><div id="checklist"></div></main>')
    for rel in [
        'registry/registry.js',
        'notifications/notifications.js',
        'progress/progress.js',
        'assistant-panel/assistant-panel.js',
        'status/status.js',
        'theme/theme.js',
        'photo-selection/view.js',
    ]:
        page.add_script_tag(content=(UI / rel).read_text())

    state = page.evaluate('''()=>{
      EbayUI.notifications.show('hello',5000);
      EbayUI.progress.show({stage:'filling',index:0,total:2,message:'Working',stageStartedAt:new Date().toISOString()});
      const firstProgress = EbayUI.progress.current();
      EbayUI.progress.show({stage:'saving',index:0,total:2,message:'Saving',stageStartedAt:new Date().toISOString()});
      const secondProgress = EbayUI.progress.current();
      EbayUI.assistantPanel.ensureStyles();
      EbayUI.assistantPanel.ensureStyles();
      const detached = EbayUI.assistantPanel.create({id:'assistant-test',html:'<b>Assistant</b>'});
      const detachedBeforeAttach = !detached.isConnected;
      EbayUI.assistantPanel.attach(detached);
      EbayUI.status.setText('status','Ready','ok');
      EbayUI.theme.applyTheme('dark');
      EbayUI.photoSelectionView.renderSourceBar({countTag:document.getElementById('count'),sourceBar:document.getElementById('sources'),counts:{upload:1,marketplace:2,screenshot:1},sourceLabel:'eBay'});
      EbayUI.photoSelectionView.renderChecklist(document.getElementById('checklist'),[{label:'Front',state:'ok',note:'loaded'},{label:'Tag',state:'review',note:'check'}]);
      return {
        registryVersion:EbayUI.version,
        toast:document.getElementById('ebay-ai-filler-toast')?.textContent,
        progress:document.getElementById('ebay-ai-progress')?.textContent,
        sameProgress:firstProgress===secondProgress,
        progressCount:document.querySelectorAll('#ebay-ai-progress').length,
        oldProgressCount:document.querySelectorAll('#ebay-ai-fast-progress-v8100,#ebay-ai-queue-progress-v802').length,
        styles:document.querySelectorAll('#ebay-ai-hover-styles').length,
        detachedBeforeAttach,
        assistantConnected:document.getElementById('assistant-test')?.isConnected,
        status:document.getElementById('status')?.textContent,
        tone:document.getElementById('status')?.dataset.tone,
        theme:document.documentElement.dataset.theme,
        count:document.getElementById('count')?.textContent,
        sources:document.getElementById('sources')?.textContent,
        checklist:document.getElementById('checklist')?.textContent
      };
    }''')

    req(state['registryVersion'] == '8.23.21', state)
    req(state['toast'] == 'hello', state)
    req('Waiting for eBay autosave' in state['progress'] and 'Saving' in state['progress'], state)
    req(state['sameProgress'] and state['progressCount'] == 1 and state['oldProgressCount'] == 0, state)
    req(state['styles'] == 1, state)
    req(state['detachedBeforeAttach'] and state['assistantConnected'], state)
    req(state['status'] == 'Ready' and state['tone'] == 'ok', state)
    req(state['theme'] == 'dark', state)
    req(state['count'] == '4 photos', state)
    req('Upload: 1' in state['sources'] and 'eBay: 2' in state['sources'], state)
    req('Front' in state['checklist'] and 'Review' in state['checklist'], state)

    actions = page.evaluate('''async()=>{
      window.__uiActions=[];
      let panel=EbayUI.assistantPanel.renderSuggestion({
        label:'Color',suggestion:'Black',statusClass:'ok',statusText:'Ready',fillDisabled:false,
        answers:[{value:'Black',key:'black',state:'pending'},{value:'White',key:'white',state:'ok'}],
        choices:[],version:'V8.23.21'
      },action=>window.__uiActions.push(`suggestion:${action}`));
      panel.querySelector('[data-action="fill"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
      EbayUI.assistantPanel.setMessage(panel,'Filled.','hf-status-ok');
      EbayUI.assistantPanel.setChip(panel,{key:'black',value:'Black',state:'ok'});
      const suggestion={
        message:panel.querySelector('.hf-live-status')?.textContent,
        chip:panel.querySelector('[data-value-key="black"]')?.textContent
      };
      panel.remove();

      panel=EbayUI.assistantPanel.renderReview({
        label:'Brand',status:'needs_review',statusLabel:'Needs review',aiValue:'Nike',primaryValue:'Nike',
        current:'Nike',sources:'Photo 1: label',validationIssues:[],version:'V8.23.21'
      },action=>window.__uiActions.push(`review:${action}`));
      panel.querySelector('[data-action="review-confirm"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
      const review=panel.querySelector('.rv-grid')?.textContent;
      panel.remove();

      const fillAll=EbayUI.assistantPanel.ensureFillAll({onStop:()=>window.__uiActions.push('fillall:stop')});
      EbayUI.assistantPanel.updateFillAll(fillAll,{status:'Working',current:'Color',percent:50,summary:'Done: 1'});
      fillAll.querySelector('[data-action="fill-all-stop"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));
      const fillState={status:fillAll.querySelector('.fa-progress-text')?.textContent,width:fillAll.querySelector('.fa-bar span')?.style.width};
      fillAll.remove();
      await new Promise(resolve=>setTimeout(resolve,0));
      return {actions:window.__uiActions,suggestion,review,fillState};
    }''')
    req(actions['actions'] == ['suggestion:fill', 'review:review-confirm', 'fillall:stop'], actions)
    req(actions['suggestion']['message'] == 'Filled.' and actions['suggestion']['chip'].startswith('✓'), actions)
    req('Nike' in actions['review'], actions)
    req(actions['fillState'] == {'status':'Working','width':'50%'}, actions)

    page.evaluate('()=>{EbayUI.notifications.hide();EbayUI.progress.remove();document.getElementById("assistant-test")?.remove();}')
    req(page.locator('#ebay-ai-filler-toast').count() == 0, 'toast cleanup failed')
    req(page.locator('#ebay-ai-progress').count() == 0, 'progress cleanup failed')
    browser.close()

print('PASS V8.23.21 Chromium UI ownership: stable registry, single progress node, notification, assistant, status, theme and photo-selection rendering')
