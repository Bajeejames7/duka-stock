# Duka Stock

A static phone-friendly stock logger backed by your Google Sheet. Take a product photo, review the suggested details, enter the exact quantity and save. Existing products also support quick entry without a photo.

## 1. Create your spreadsheet and backend

1. Create a blank Google Sheet in the Google account that should own the shop records. Give it a name such as **Duka Stock**.
2. In the Sheet, open **Extensions → Apps Script**. Replace the contents of `Code.gs` with [apps-script/Code.gs](apps-script/Code.gs).
3. Open **Project Settings** (gear icon). Enable **Show appsscript.json manifest file in editor**. In the editor, replace `appsscript.json` with [apps-script/appsscript.json](apps-script/appsscript.json). Save.
4. In **Project Settings → Script Properties → Add script property**, enter:

   | Property | Value |
   | --- | --- |
   | `SHOP_PIN` | A private PIN you will share with trusted staff |
   | `GEMINI_API_KEY` | Your Gemini API key from Google AI Studio |
   | `GEMINI_MODEL` | Optional; defaults to `gemini-2.5-flash` |
   | `SAVE_PHOTOS` | `false` (default), or `true` to keep photos in Drive |

5. Obtain a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) using your Google account. Keep it only in Script Properties. API free-tier availability and quotas depend on your account; check the provider's displayed terms before enabling billing. Hosting this app needs no paid server.
6. In the editor's function selector choose **initialize**, then **Run**. Review and grant the requested permissions for your own script. This stores `SPREADSHEET_ID` automatically and creates the Products and Log tabs. Do not manually alter their headers. If Google displays an unverified-app warning, proceed only after verifying this is the script you just created in your own account. Workspace administrators may restrict deployments.
7. Click **Deploy → New deployment → Select type → Web app**. Set **Execute as: Me**, **Who has access: Anyone**, and click **Deploy**. Copy the Web app URL ending in `/exec`, not the editor URL or a `/dev` test URL.
8. If you change the code later, use **Deploy → Manage deployments → Edit → New version → Deploy** to update the existing URL. If enabling photos later, set `SAVE_PHOTOS=true`, run `initialize` again to authorize Drive, then update the deployment.

The PIN protects every API action. The Gemini key stays on Google's backend. The PIN and connection are stored in the phone's localStorage, so use trusted devices. Photos go to Gemini for recognition; when photo storage is enabled, copies also go into the owner's private **Duka Stock Photos** Drive folder. Stored links require Drive permission; files are not made public.

## 2. Host the webpage free with GitHub Pages

1. Create a GitHub repository. Upload the contents of **web/** (`index.html`, `app.js`, `styles.css`, `manifest.json`, `sw.js` and the `icons` directory) to the repository root. Keep the folder structure for `icons/icon.svg`. Do not upload any secret keys.
2. Open the repository's **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, select **main** and **/(root)**, then **Save**.
3. Wait for the Pages deployment and open the HTTPS website URL shown there on your phone. A project repository URL may include the repository name; the app uses relative paths so it works there too.
4. Alternatively, upload the `web/` folder as a static site to Netlify. No build command is needed.
5. On the first screen enter your Apps Script `/exec` URL, Shop PIN, and staff name. Tap **Test connection & save**. This tests `ping`, then runs `setup` to ensure the sheet headers exist. Each staff phone has its own name and settings.
6. On Android Chrome use the browser menu's **Install app** or **Add to Home screen** when available. On iPhone Safari use **Share → Add to Home Screen**. Installation is optional. Visit once online to cache the interface for offline use.

For local development serve `web/` with any static HTTP server (for example `npx http-server web`). Camera and service worker features require HTTPS or localhost. Opening the HTML as a `file:` URL is not supported.

## 3. Use the app

- Tap **Take or choose product photo**. Images are resized to a maximum 1024-pixel side and encoded as JPEG at quality 0.8. Native barcode detection is tried first, followed by ZXing from a pinned CDN URL. A catalog barcode match skips AI. Otherwise Gemini suggests editable details and the backend offers up to three catalog matches based on normalized token overlap.
- Pick an existing match or use the new-product suggestion. Check the brand, name, variant, model and barcode carefully; AI can misread packaging. Selecting an existing product allows its details to be edited when saving.
- Enter a whole-number quantity. **Stock count** replaces the current stock with that exact quantity; **Received** adds; **Sold/Removed** subtracts. Negative resulting stock is rejected. Optional price is in KES; a blank price preserves an existing product's price. Add notes if useful, then save.
- **Products** searches the catalog and shows current stock. Tap a product for quick entry. **Recent log** displays the last 20 saved entries. New products get a brand-based SKU such as `ORAIMO-0001`.
- Failed network requests stay in localStorage with a pending badge and retry when online, on opening the app, and every 30 seconds. Keep the same device and browser until pending entries have synced. Offline photo identification is unavailable; you can enter product details manually. Pending photos consume device storage; if storage is full the form remains available so you can retry or use a smaller photo.
- Server validation failures remain pending and display their cause. Fix the relevant sheet data (for example insufficient stock) or connection/PIN in Settings; the queued request will retry. Entries are sent in order, so a rejected first entry blocks later ones. Settings cannot switch shops or reset while entries are pending. If the server PIN changes, enter the new PIN in Settings using the same URL; pending requests will use the updated PIN.
- Avoid editing a product's stock directly while staff are logging; use stock-count entries to preserve the audit trail. Do not remove Log cell notes: the first-column notes contain request IDs used to prevent duplicate retries. Writes use a script lock and a small recovery journal in Script Properties; do not remove `PENDING_WRITE` if it is present.

## Troubleshooting and validation

An invalid response usually means the deployment is not accessible to Anyone, the URL is not the `/exec` URL, or the newest version was not deployed. Test the webpage's connection after fixing deployment settings. Recognition errors can indicate a missing API key, unsupported model, quota limits, or an unclear photo; manual entry still works. Backend requests use POST with `Content-Type: text/plain;charset=utf-8` to avoid a CORS preflight. Never add browser-side API keys.

Before using live inventory, test on a spare Sheet: set a count to 10, receive 3, remove 2, and verify stock 11 with three log rows; edit an existing product; test barcode matching and a new photo; check search and recent log; go offline, save a manual entry, reconnect and verify one log row. Retry the same request ID to verify it is not counted twice. Test on two phones to check simultaneous entries. Timestamps use Africa/Nairobi.

Run `node --check web/app.js` and `node --check web/sw.js` to check JavaScript syntax. To syntax-check Apps Script locally, copy `apps-script/Code.gs` to a temporary `.js` file and run `node --check` on it; Google service calls require a deployed Apps Script environment to test.

Files: `web/` contains the static PWA, service worker, manifest and SVG icon; `apps-script/` contains the backend and timezone/permissions manifest. No build step or framework is required.
