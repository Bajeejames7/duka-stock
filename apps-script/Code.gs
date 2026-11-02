/* Bound to the shop spreadsheet. Secrets belong in Script Properties. */
const STAFF_PAGE_URL = 'https://bajeejames7.github.io/duka-stock/';
const PRODUCT_HEADERS = ['SKU','Brand','Product Name','Category','Variant','Model No','Barcode','Price (KES)','Current Stock','Last Updated','Updated By'];
const LOG_HEADERS = ['Timestamp','SKU','Product Name','Action','Quantity','Stock Before','Stock After','Price (KES)','Staff','Notes','Photo'];
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Duka Stock').addItem('Set up / repair', 'initialize').addItem('Set Gemini API key', 'setGeminiApiKey').addItem('Get staff link', 'getStaffLink').addToUi();
}
function setGeminiApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Set Gemini API key', 'Paste your Gemini API key.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const key = response.getResponseText().trim();
  if (!key) { ui.alert('Enter an API key.'); return; }
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  ui.alert('Gemini API key saved.');
}
function getStaffLink() {
  const ui = SpreadsheetApp.getUi(), url = ScriptApp.getService().getUrl();
  if (!url || /\/dev$/.test(url)) { ui.alert('Deploy as web app first'); return; }
  initialize();
  const pin = PropertiesService.getScriptProperties().getProperty('SHOP_PIN');
  const link = STAFF_PAGE_URL + '#u=' + encodeURIComponent(url) + '&p=' + encodeURIComponent(pin);
  const escaped = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = HtmlService.createHtmlOutput('<p>Share this link with trusted staff on WhatsApp.</p><p><a target="_blank" rel="noopener noreferrer" href="' + escaped + '">Open Duka Stock</a></p><textarea aria-label="Staff link" readonly style="width:100%;height:100px">' + escaped + '</textarea>').setWidth(450).setHeight(240);
  ui.showModalDialog(html, 'Staff link');
}
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const properties = PropertiesService.getScriptProperties();
    const pin = properties.getProperty('SHOP_PIN');
    if (!pin || String(data.pin) !== pin) throw new Error('Missing or incorrect Shop PIN.');
    let result;
    switch (data.action) {
      case 'ping': result = { message: 'Connected' }; break;
      case 'setup': result = locked_(function () { setup_(); return { message: 'Sheets ready' }; }); break;
      case 'products': result = locked_(function () { recover_(); return { products: products_() }; }); break;
      case 'recent': result = locked_(function () { recover_(); return { entries: recent_() }; }); break;
      case 'identify': result = identify_(data); break;
      case 'log': result = locked_(function () { setup_(); recover_(); return log_(data); }); break;
      default: throw new Error('Unknown action.');
    }
    return json_(Object.assign({ ok: true }, result));
  } catch (error) { return json_({ ok: false, error: error.message || 'Request failed.' }); }
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function locked_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(30000); try { return fn(); } finally { lock.releaseLock(); } }
function book_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  const book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Run initialize in the bound spreadsheet editor once.');
  return book;
}
// Run from the spreadsheet menu to bind the deployment and grant permissions.
function initialize() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open Apps Script from the shop spreadsheet.');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', book.getId());
  if (!props.getProperty('SHOP_PIN')) props.setProperty('SHOP_PIN', String(Math.floor(100000 + Math.random() * 900000)));
  setup_();
  // Authorize optional Drive access now, before deploying.
  if (PropertiesService.getScriptProperties().getProperty('SAVE_PHOTOS') === 'true') DriveApp.getRootFolder().getName();
}
function setup_() {
  const book = book_(); book.setSpreadsheetTimeZone('Africa/Nairobi');
  [['Products', PRODUCT_HEADERS], ['Log', LOG_HEADERS]].forEach(function (pair) {
    const sheet = book.getSheetByName(pair[0]) || book.insertSheet(pair[0]);
    if (sheet.getLastRow() === 0) { sheet.getRange(1, 1, 1, pair[1].length).setValues([pair[1]]); sheet.setFrozenRows(1); }
    else if (JSON.stringify(sheet.getRange(1, 1, 1, pair[1].length).getValues()[0]) !== JSON.stringify(pair[1])) throw new Error(pair[0] + ' headers do not match the required layout.');
  });
}
function sheet_(name) { const sheet = book_().getSheetByName(name); if (!sheet) throw new Error('Run setup first.'); return sheet; }
function rows_(sheet) { return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues(); }
function product_(row) { return { sku: String(row[0]), brand: String(row[1]), product_name: String(row[2]), category: String(row[3]), variant: String(row[4]), model_number: String(row[5]), barcode: String(row[6]), price: row[7] === '' ? null : Number(row[7]), stock: Number(row[8]) || 0, updated: row[9], staff: String(row[10]) }; }
function products_() { return rows_(sheet_('Products')).filter(function (row) { return row[0]; }).map(product_); }
function recent_() {
  const sheet = sheet_('Log'), end = sheet.getLastRow();
  if (end < 2) return [];
  return sheet.getRange(Math.max(2, end - 19), 1, Math.min(20, end - 1), 11).getValues().reverse().map(function (r) {
    return { timestamp: r[0] instanceof Date ? Utilities.formatDate(r[0], 'Africa/Nairobi', 'yyyy-MM-dd HH:mm:ss') : String(r[0]), sku: r[1], product_name: r[2], action: r[3], quantity: r[4], stock_before: r[5], stock_after: r[6], price: r[7], staff: r[8], notes: r[9], photo: r[10] };
  });
}
function text_(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 200); }
// Prevent user-entered spreadsheet formulas without changing displayed text.
function cell_(value) { return typeof value === 'string' && /^[=+@\-]/.test(value) ? "'" + value : value; }
function tokens_(product) { return new Set([product.brand, product.product_name, product.variant, product.model_number].join(' ').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean)); }
function identify_(data) {
  const props = PropertiesService.getScriptProperties(), key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Set GEMINI_API_KEY in Script Properties.');
  const image = image_(data.image);
  const model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  const response = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, muteHttpExceptions: true,
    payload: JSON.stringify({ contents: [{ parts: [{ text: 'Identify this Kenyan phone accessory/electronics retail product from visible packaging. Common brands: Oraimo, Tecno, Infinix, itel, Samsung, Xiaomi/Redmi, Anker, JBL, Vention, Ugreen, Hoco, Lenovo, HP, generic. Return ONLY strict JSON with brand, product_name, category, variant, model_number, barcode (strings) and confidence (0 to 1). Variant captures connector types, wattage, length, capacity and colour, for example USB-C to USB-C, 60W, 1m. Do not invent unreadable details; use empty strings and lower confidence. Product name should be concise. Detected barcode if available: ' + text_(data.barcode, 100) }, { inlineData: { mimeType: 'image/jpeg', data: image } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } })
  });
  if (response.getResponseCode() !== 200) throw new Error('Image recognition unavailable (HTTP ' + response.getResponseCode() + '). Check the API key, quota and model.');
  const body = JSON.parse(response.getContentText());
  const parts = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts;
  if (!parts) throw new Error('No recognition result. Try a clearer photo.');
  let raw; try { raw = JSON.parse(parts.map(function (part) { return part.text || ''; }).join('')); } catch (_) { throw new Error('Recognition returned invalid JSON. Try again.'); }
  const suggestion = {};
  ['brand','product_name','category','variant','model_number','barcode'].forEach(function (field) { suggestion[field] = text_(raw[field]); });
  if (data.barcode) suggestion.barcode = text_(data.barcode, 100);
  suggestion.confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const wanted = tokens_(suggestion);
  const candidates = locked_(function () { recover_(); return products_(); }).map(function (product) {
    const actual = tokens_(product); let overlap = 0; wanted.forEach(function (token) { if (actual.has(token)) overlap++; });
    const score = overlap / Math.max(1, wanted.size + actual.size - overlap);
    return Object.assign({}, product, { score: suggestion.barcode && product.barcode === suggestion.barcode ? 1 : score });
  }).filter(function (product) { return product.score > 0; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 3);
  return { suggestion: suggestion, candidates: candidates };
}
function image_(value) { if (typeof value !== 'string' || !value || value.length > 4000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid or oversized JPEG image.'); return value; }
function photo_(image, requestId) {
  if (!image || PropertiesService.getScriptProperties().getProperty('SAVE_PHOTOS') !== 'true') return '';
  const folders = DriveApp.getFoldersByName('Duka Stock Photos'); const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('Duka Stock Photos');
  return folder.createFile(Utilities.newBlob(Utilities.base64Decode(image_(image)), 'image/jpeg', requestId + '.jpg')).getUrl();
}
// A small write-ahead journal makes interrupted writes replayable under the lock.
function recover_() {
  const props = PropertiesService.getScriptProperties(), pending = props.getProperty('PENDING_WRITE');
  if (!pending) return;
  const tx = JSON.parse(pending), products = sheet_('Products'), log = sheet_('Log');
  products.getRange(tx.productRow, 1, 1, 11).setValues([tx.product]);
  log.getRange(tx.logRow, 1, 1, 11).setValues([tx.log]);
  log.getRange(tx.logRow, 1).setNote(tx.requestId);
  SpreadsheetApp.flush(); props.deleteProperty('PENDING_WRITE');
}
function log_(data) {
  const requestId = text_(data.requestId, 100);
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestId)) throw new Error('Invalid request ID.');
  const log = sheet_('Log');
  if (log.getLastRow() > 1) {
    const notes = log.getRange(2, 1, log.getLastRow() - 1, 1).getNotes();
    if (notes.some(function (row) { return row[0] === requestId; })) return { duplicate: true };
  }
  const quantity = Number(data.quantity), action = data.actionType;
  if (!Number.isSafeInteger(quantity) || quantity < 0 || ['count','received','removed'].indexOf(action) < 0) throw new Error('Invalid action or quantity.');
  const staff = text_(data.staff, 100); if (!staff) throw new Error('Staff name is required.');
  const product = data.product || {}, name = text_(product.product_name);
  if (!name) throw new Error('Product name is required.');
  const products = sheet_('Products'), rows = rows_(products);
  let index = data.sku ? rows.findIndex(function (row) { return String(row[0]) === String(data.sku); }) : -1;
  if (data.sku && index < 0) throw new Error('Product SKU no longer exists.');
  const before = index < 0 ? 0 : Number(rows[index][8]);
  if (!Number.isSafeInteger(before) || before < 0) throw new Error('Correct the current stock in Products first.');
  const after = action === 'count' ? quantity : action === 'received' ? before + quantity : before - quantity;
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('Stock cannot be negative or exceed the supported quantity.');
  let price = data.price == null || data.price === '' ? (index < 0 ? '' : rows[index][7]) : Number(data.price);
  if (price !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('Invalid price.');
  let sku = index < 0 ? '' : String(rows[index][0]);
  if (!sku) {
    const brand = text_(product.brand, 100).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'GENERIC';
    let sequence = 1;
    do { sku = brand + '-' + String(sequence++).padStart(4, '0'); } while (rows.some(function (row) { return row[0] === sku; }));
  }
  const timestamp = Utilities.formatDate(new Date(), 'Africa/Nairobi', 'yyyy-MM-dd HH:mm:ss');
  const photo = photo_(data.image, requestId);
  const productRow = [sku, text_(product.brand, 100), name, text_(product.category, 100), text_(product.variant), text_(product.model_number, 100), text_(product.barcode, 100), price, after, timestamp, staff].map(cell_);
  const logRow = [timestamp, sku, name, action, quantity, before, after, price, staff, text_(data.notes, 2000), photo].map(cell_);
  const tx = { requestId: requestId, productRow: index < 0 ? products.getLastRow() + 1 : index + 2, logRow: log.getLastRow() + 1, product: productRow, log: logRow };
  PropertiesService.getScriptProperties().setProperty('PENDING_WRITE', JSON.stringify(tx)); recover_();
  return { sku: sku, stock: after };
}
