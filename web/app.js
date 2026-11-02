'use strict';
const $ = id => document.getElementById(id);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
let config = read('duka-config', null), catalog = [], selected = '', photo = null, retrying = false, busy = false;
let queue = read('duka-queue', []);
const fields = ['brand', 'product_name', 'category', 'variant', 'model_number', 'barcode'];
const form = $('entry-form');
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function badge() { $('pending').textContent = queue.length ? `${queue.length} pending` : ''; }
function persistQueue(next) { localStorage.setItem('duka-queue', JSON.stringify(next)); queue = next; badge(); }
async function api(action, payload = {}, connection = config) {
  if (!connection) throw new Error('Set up your shop connection first.');
  let response;
  try {
    response = await fetch(connection.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, action, pin: connection.pin }), redirect: 'follow', signal: AbortSignal.timeout(90000) });
  } catch (cause) { const error = new Error('Network unavailable or request timed out.'); error.network = true; throw error; }
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}. Try again later.`);
  let result;
  try { result = await response.json(); } catch (_) { throw new Error('Invalid server response. Check the deployment URL and access setting.'); }
  if (!result.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function show(screen) {
  if (!config) screen = 'settings';
  ['entry','products','recent','settings'].forEach(id => { $(id).hidden = id !== screen; });
  document.querySelectorAll('[data-screen]').forEach(button => { if (button.dataset.screen === screen) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  if (screen === 'products') loadProducts();
  if (screen === 'recent') loadRecent();
}
document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => show(button.dataset.screen)));
if (config) ['url','pin','staff'].forEach(key => { $(key).value = config[key]; });
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const next = { url: $('url').value.trim(), pin: $('pin').value, staff: $('staff').value.trim() };
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(next.url) || !next.staff) return message('Enter a deployed Apps Script /exec URL and staff name.', true);
  if (queue.length && config && next.url !== config.url) return message('Send pending entries before changing the shop connection.', true);
  const button = event.submitter; button.disabled = true; message('Testing connection…');
  try { await api('ping', {}, next); await api('setup', {}, next); localStorage.setItem('duka-config', JSON.stringify(next)); config = next; message('Connection ready.'); show('entry'); retryQueue(); }
  catch (error) { message(error.message, true); } finally { button.disabled = false; }
});
$('reset').addEventListener('click', () => {
  if (queue.length) return message('Send pending entries before resetting settings.', true);
  localStorage.removeItem('duka-config'); config = null; $('settings-form').reset(); show('settings'); message('Settings reset.');
});
function fill(product = {}) {
  selected = product.sku || '';
  fields.forEach(key => { form.elements[key].value = product[key] || ''; });
  form.elements.price.value = product.price ?? '';
  $('selection').textContent = selected ? `${selected} · Current stock: ${product.stock}` : 'New product';
}
function clearEntry() { form.reset(); fill(); photo = null; $('photo').value = ''; $('preview').hidden = true; $('preview').removeAttribute('src'); $('matches').replaceChildren(); }
$('new-product').addEventListener('click', clearEntry);
function card(container, title, detail, pick) {
  const article = document.createElement('article'); article.className = 'card';
  const heading = document.createElement(pick ? 'button' : 'strong'); heading.textContent = title;
  if (pick) { heading.type = 'button'; heading.addEventListener('click', pick); }
  const description = document.createElement('p'); description.className = 'muted'; description.textContent = detail;
  article.append(heading, description); container.append(article);
}
async function loadProducts() {
  try { const result = await api('products'); catalog = result.products; renderProducts(); } catch (error) { message(error.message, true); }
}
function renderProducts() {
  const query = $('search').value.toLowerCase(); const list = $('product-list'); list.replaceChildren();
  const products = catalog.filter(product => [product.sku, ...fields.map(key => product[key])].join(' ').toLowerCase().includes(query));
  products.forEach(product => card(list, `${product.brand} ${product.product_name}`, `${product.variant || ''} · ${product.sku} · Stock: ${product.stock}`, () => { clearEntry(); fill(product); show('entry'); }));
  if (!products.length) list.textContent = 'No products found.';
}
$('search').addEventListener('input', renderProducts); $('refresh-products').addEventListener('click', loadProducts);
async function loadRecent() {
  try { const result = await api('recent'); const list = $('recent-list'); list.replaceChildren(); result.entries.forEach(entry => card(list, `${entry.product_name} · ${entry.action} ${entry.quantity}`, `${entry.timestamp} · ${entry.staff} · ${entry.stock_before} → ${entry.stock_after}${entry.notes ? ' · ' + entry.notes : ''}`)); if (!result.entries.length) list.textContent = 'No stock entries yet.'; }
  catch (error) { message(error.message, true); }
}
$('refresh-recent').addEventListener('click', loadRecent);
async function resize(file) {
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); const scale = Math.min(1, 1024 / Math.max(img.width, img.height)); const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height); return { canvas, data: canvas.toDataURL('image/jpeg', .8).split(',')[1] }; }
  finally { URL.revokeObjectURL(url); }
}
let zxingPromise;
async function barcode(canvas) {
  if ('BarcodeDetector' in window) { try { const results = await new BarcodeDetector().detect(canvas); if (results.length) return results[0].rawValue; } catch (_) { /* Try ZXing on unsupported detector formats. */ } }
  try {
    if (!zxingPromise) zxingPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; script.onload = resolve; script.onerror = () => { zxingPromise = null; reject(new Error('Barcode library unavailable')); }; document.head.append(script); });
    await zxingPromise; const reader = new window.ZXing.BrowserMultiFormatReader(); const result = reader.decodeFromCanvas(canvas); return result.getText();
  } catch (_) { return ''; }
}
$('photo').addEventListener('change', async () => {
  const file = $('photo').files[0]; if (!file || busy) return;
  busy = true; $('photo').disabled = true; form.querySelector('[type=submit]').disabled = true; message('Reading photo…');
  try {
    const resized = await resize(file); photo = resized.data; $('preview').src = `data:image/jpeg;base64,${photo}`; $('preview').hidden = false;
    const code = await barcode(resized.canvas);
    if (code) { const result = await api('products'); catalog = result.products; const match = catalog.find(product => String(product.barcode) === code); if (match) { fill(match); message('Barcode matched an existing product. Enter quantity.'); return; } }
    message('Identifying product…'); const result = await api('identify', { image: photo, barcode: code }); fill(result.suggestion);
    const matches = $('matches'); matches.replaceChildren();
    result.candidates.forEach(product => card(matches, `${product.brand} ${product.product_name}`, `${product.variant} · Current stock: ${product.stock}`, () => fill(product)));
    if (result.candidates.length) card(matches, 'Use new product suggestion', 'Review and edit the suggested fields.', () => fill(result.suggestion));
    message(`Review all fields before saving. AI confidence: ${Math.round(Number(result.suggestion.confidence || 0) * 100)}%.`);
  } catch (error) { message(error.message + ' You can enter the product manually.', true); }
  finally { busy = false; $('photo').disabled = false; form.querySelector('[type=submit]').disabled = false; }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !config) return;
  const quantity = Number(form.elements.quantity.value); if (!Number.isSafeInteger(quantity) || quantity < 0) return message('Quantity must be a non-negative whole number.', true);
  const product = Object.fromEntries(fields.map(key => [key, form.elements[key].value.trim()]));
  const payload = { requestId: crypto.randomUUID(), sku: selected, product, quantity, actionType: form.elements.actionType.value, price: form.elements.price.value === '' ? null : Number(form.elements.price.value), notes: form.elements.notes.value.trim(), staff: config.staff, image: photo };
  busy = true; event.submitter.disabled = true;
  try {
    // Persist before sending: a lost response can safely replay the same request ID.
    persistQueue([...queue, { payload: { ...payload, image: null }, url: config.url }]);
    clearEntry(); await retryQueue();
  } catch (error) { message('Could not store this entry on the device. Free some storage and try again. ' + error.message, true); }
  finally { busy = false; event.submitter.disabled = false; }
});
async function retryQueue() {
  if (retrying || !config || !queue.length) return;
  retrying = true;
  try {
    while (queue.length) {
      const item = queue[0]; if (item.url !== config.url) throw new Error('Pending entry belongs to a different shop URL. Restore its connection in Settings.');
      try { await api('log', item.payload); }
      catch (error) { message(error.network ? `Saved on device. ${queue.length} pending; retrying when online.` : `Pending entry needs attention: ${error.message} Correct the sheet or connection, then retry.`, !error.network); return; }
      persistQueue(queue.slice(1));
    }
    message('Stock saved successfully.');
  } catch (error) { message(error.message, true); } finally { retrying = false; }
}
window.addEventListener('online', retryQueue); setInterval(() => { if (navigator.onLine) retryQueue(); }, 30000);
badge(); show(config ? 'entry' : 'settings'); if (config) retryQueue();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
