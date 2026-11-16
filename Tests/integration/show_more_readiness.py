from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
EXT = ROOT / 'Extension'

def req(condition, message):
    if not condition:
        raise AssertionError(message)

BASE_STYLE = """
<style>
  body { font-family: sans-serif; margin: 24px; }
  section { width: 900px; }
  .smry.summary__attributes { width: 760px; min-height: 80px; }
  [data-testid='attribute'] { display: flex; gap: 20px; margin: 12px 0; min-height: 36px; }
  .summary__attributes--label { width: 220px; }
  .summary__attributes--value { width: 420px; }
  button, input { min-width: 180px; min-height: 32px; }
</style>
"""

def row_html(label, name, value=''):
    return f"""
    <div data-testid='attribute'>
      <div class='summary__attributes--label'><label>{label}</label></div>
      <div class='summary__attributes--value'><input name='attributes.{name}' value='{value}'></div>
    </div>
    """

def fixture(ignore_first_click=False):
    ignore = 'true' if ignore_first_click else 'false'
    return f"""
    {BASE_STYLE}
    <section id='specifics-section'>
      <h2>Item specifics</h2>
      <div class='smry summary__attributes' id='root'>
        {row_html('Brand', 'Brand', 'Example')}
      </div>
      <div id='toggle-slot'></div>
    </section>
    <script>
      (() => {{
        let clicks = 0;
        const ignoreFirst = {ignore};
        setTimeout(() => {{
          const slot = document.getElementById('toggle-slot');
          const button = document.createElement('button');
          button.id = 'show-more';
          button.textContent = 'Show more';
          // Regression: eBay can expose a longer accessibility label while the
          // visible text remains the short control text.
          button.setAttribute('aria-label', 'Show more item specifics');
          button.addEventListener('click', () => {{
            clicks += 1;
            window.__showMoreClicks = clicks;
            if (ignoreFirst && clicks === 1) return;
            document.getElementById('root').insertAdjacentHTML('beforeend', `
              {row_html('Theme', 'Theme')}
              {row_html('Character', 'Character')}
            `);
            button.remove();
            const less = document.createElement('button');
            less.id = 'show-less';
            less.textContent = 'Show less';
            less.setAttribute('aria-label', 'Show less item specifics');
            slot.appendChild(less);
          }});
          slot.appendChild(button);
        }}, 650);
      }})();
    </script>
    """

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1200, 'height': 900})

    # Scenario 1: Show more is hydrated after the initial rows. Snapshot must
    # wait for it, expand it, then include the hidden fields.
    page.set_content(fixture(False))
    for rel in ['shared/config.js', 'core/policy.js', 'core/snapshot.js']:
        page.add_script_tag(content=(EXT / rel).read_text())
    first = page.evaluate("""async()=>{
      const started=Date.now();
      const listing=await EbayPageFieldsV810.collectListing({requirePhotos:false,photoLimit:0,readinessTimeoutMs:3500});
      return {
        elapsed:Date.now()-started,
        ok:listing.ok,
        ready:listing.ready,
        questions:listing.routeQuestions,
        readiness:listing.debug?.itemSpecifics || {},
        clicks:window.__showMoreClicks || 0,
        showLess:Boolean(document.getElementById('show-less'))
      };
    }""")
    req(first['ok'] and first['ready'], f"late Show more listing was not ready: {first}")
    req(first['clicks'] == 1, f"late Show more should be clicked once: {first}")
    req(first['showLess'], f"Show less confirmation missing: {first}")
    req({'Brand', 'Theme', 'Character'}.issubset(set(first['questions'])), f"hidden fields missing from snapshot: {first}")
    req(first['readiness'].get('collapsed') is False and first['readiness'].get('expanded') is True, f"readiness did not confirm expansion: {first}")
    req(first['elapsed'] >= 600, f"snapshot returned before late Show more could hydrate: {first}")

    # Scenario 2: first click is ignored. Only one bounded retry is allowed and
    # it must still finish with the expanded field set.
    page.set_content(fixture(True))
    for rel in ['shared/config.js', 'core/policy.js', 'core/snapshot.js']:
        page.add_script_tag(content=(EXT / rel).read_text())
    second = page.evaluate("""async()=>{
      const listing=await EbayPageFieldsV810.collectListing({requirePhotos:false,photoLimit:0,readinessTimeoutMs:4200});
      return {
        ok:listing.ok,
        questions:listing.routeQuestions,
        readiness:listing.debug?.itemSpecifics || {},
        clicks:window.__showMoreClicks || 0,
        showLess:Boolean(document.getElementById('show-less'))
      };
    }""")
    req(second['ok'], f"bounded Show more retry failed: {second}")
    req(second['clicks'] == 2, f"expected exactly one retry after ignored click: {second}")
    req(second['readiness'].get('clickAttempts') == 2, f"retry count not bounded to two attempts: {second}")
    req(second['showLess'] and 'Theme' in second['questions'] and 'Character' in second['questions'], f"retry snapshot missed hidden fields: {second}")

    # Scenario 3: a direct expand-aware field-map caller must enter the same
    # readiness gate even when Show more is not present at the instant of call.
    page.set_content(fixture(False))
    for rel in ['shared/config.js', 'core/policy.js', 'core/snapshot.js']:
        page.add_script_tag(content=(EXT / rel).read_text())
    third = page.evaluate("""async()=>{
      const map=await EbayPageFieldsV810.collectFieldMap({force:true,expand:true,timeoutMs:3500});
      return {keys:Array.from(map.keys()), clicks:window.__showMoreClicks || 0, showLess:Boolean(document.getElementById('show-less'))};
    }""")
    req(third['clicks'] == 1 and third['showLess'], f"direct expand caller did not open late Show more: {third}")
    req({'brand', 'theme', 'character'}.issubset(set(third['keys'])), f"direct expand field map missed hidden fields: {third}")

    # Scenario 4: if the page refuses both bounded clicks, do not silently hand
    # Fill an incomplete visible-only field map.
    page.set_content(f"""
      {BASE_STYLE}
      <section><h2>Item specifics</h2>
        <div class='smry summary__attributes' id='root'>{row_html('Brand', 'Brand', 'Example')}</div>
        <button id='stuck-more' aria-label='Show more item specifics'>Show more</button>
      </section>
      <script>window.__stuckClicks=0;document.getElementById('stuck-more').addEventListener('click',()=>window.__stuckClicks+=1);</script>
    """)
    for rel in ['shared/config.js', 'core/policy.js', 'core/snapshot.js']:
        page.add_script_tag(content=(EXT / rel).read_text())
    fourth = page.evaluate("""async()=>{
      try {
        await EbayPageFieldsV810.collectFieldMap({force:true,expand:true,timeoutMs:1900});
        return {threw:false,clicks:window.__stuckClicks || 0};
      } catch (error) {
        return {threw:true,clicks:window.__stuckClicks || 0,message:String(error?.message || error)};
      }
    }""")
    req(fourth['threw'], f"collapsed Item Specifics must not yield a partial field map: {fourth}")
    req(fourth['clicks'] == 2, f"collapsed retry must remain bounded to two clicks: {fourth}")
    req('collapsed or unstable' in fourth.get('message',''), f"collapsed failure reason missing: {fourth}")

    browser.close()

print('PASS V8.23.21 Show More readiness: late hydration, accessibility-label variant, expanded snapshot, and one bounded retry')
