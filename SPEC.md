# Duka Stock — photo-based stock logging for a Kenyan electronics/accessories shop

## Goal
Replace manual stock logging. A staff member opens a webpage on their phone, snaps a photo of a
product (e.g. "Oraimo USB-C to USB-C cable 60W 1m"), the app auto-fills the product name/brand/
category from the photo, the staff types the exact stock quantity, and it is saved to a Google Sheet.

## Architecture (follow exactly — no build step, no frameworks, no paid servers)
1. `web/` — static mobile-first PWA: `index.html`, `app.js`, `styles.css`, `manifest.json`,
   `sw.js`, icons (simple SVG). Must work when hosted on GitHub Pages / Netlify (pure static).
   Vanilla JS only. Libraries only from CDN if truly needed (e.g. ZXing for barcode fallback).
2. `apps-script/Code.gs` (+ `appsscript.json`) — Google Apps Script bound to the user's Google Sheet,
   deployed as a Web App ("Execute as: Me", "Who has access: Anyone"). This is the backend.
3. `README.md` — step-by-step setup for a non-developer (copy script into Sheet > Extensions > Apps
   Script, set Script Properties, deploy, copy URL, paste into the webpage). Plus how to host `web/`
   free on GitHub Pages.

## First-run setup screen (web)
- Asks for: Apps Script Web App URL, Shop PIN, staff name. Button "Test connection" calls `ping`.
- On success it calls `setup` which creates the sheet tabs/headers if missing. Save to localStorage.
- Settings screen to change/reset these later.

## Image recognition
- Client: capture via `<input type="file" accept="image/*" capture="environment">`. Resize to max
  1024px longest side, JPEG quality ~0.8, send as base64.
- Barcode first: try `BarcodeDetector` (if supported), fallback to ZXing from CDN. If a barcode is found
  and it matches a product in the catalog → fill instantly, skip AI.
- Otherwise backend `identify` action calls Google Gemini API (`gemini-2.5-flash`, model name in a
  Script Property `GEMINI_MODEL` with that default) using `GEMINI_API_KEY` from Script Properties
  (never exposed to browser). Prompt it to return strict JSON:
  `{brand, product_name, category, variant, model_number, barcode, confidence}` — tuned for phone
  accessories/electronics common in Kenya (Oraimo, Tecno, Infinix, itel, Samsung, Xiaomi/Redmi, Anker,
  JBL, Vention, Ugreen, Hoco, Lenovo, HP, generic). Variant should capture things like "USB-C to
  USB-C, 60W, 1m". Use `responseMimeType: "application/json"`.
- Backend then fuzzy-matches the result against the Products catalog (normalised token overlap on
  brand+name+variant+model) and returns the top 3 candidate existing products plus the AI suggestion.
- UI shows: matched existing product(s) (tap to pick, shows current stock) OR "New product" form
  prefilled from AI (all fields editable). User can always edit before saving.

## Stock entry
- Large numeric input for quantity. Action selector: "Stock count (set exact)" [default],
  "Received (+)", "Sold/Removed (−)". Optional price (KES) and notes.
- Save → backend `log` action: creates product if new (SKU auto: BRAND-XXXX), updates
  Current Stock per action, appends a row to Log. Uses `LockService` to avoid race conditions.
- Optional: save photo to a Drive folder "Duka Stock Photos" (Script Property `SAVE_PHOTOS`=true/false,
  default false) and store the link.

## Sheets (created by `setup`)
- `Products`: SKU | Brand | Product Name | Category | Variant | Model No | Barcode | Price (KES) |
  Current Stock | Last Updated | Updated By
- `Log`: Timestamp | SKU | Product Name | Action | Quantity | Stock Before | Stock After | Price (KES) |
  Staff | Notes | Photo
- Timestamps in Africa/Nairobi timezone (set in appsscript.json).

## Other screens
- Products list: searchable, shows current stock, tap to do quick stock entry without photo.
- Recent log (last 20 entries).
- Offline queue: if a `log` request fails due to network, queue in localStorage and retry automatically
  when online; show pending count badge.

## API contract
- All requests: `POST` to Web App URL with `Content-Type: text/plain;charset=utf-8` (avoids CORS
  preflight, which Apps Script cannot answer) and body JSON `{action, pin, ...}`. Response JSON via
  `ContentService` `{ok:true, ...}` or `{ok:false, error}`.
- Actions: `ping`, `setup`, `identify`, `products`, `log`, `recent`.
- PIN checked against Script Property `SHOP_PIN`. Reject if missing/wrong.

## Quality bar
- Clean, fast, large tap targets, works one-handed on a cheap Android phone over slow data.
- Clear loading/error states. No secrets in front-end code.
- Keep code readable with brief comments. Run `node --check` on JS files. Do not invent features
  beyond this spec.
