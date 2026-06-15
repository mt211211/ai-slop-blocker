# Chrome Web Store Submission Guide

Prepared June 13, 2026.

## Before uploading

1. Test the unpacked `extension` folder in Chrome.
2. Run `node scripts/validate.mjs`.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/package.ps1`.
4. Confirm the newest `outputs/ai-slop-blocker-v*.zip` contains `manifest.json` at its root.

## Upload and submit

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Select **New item**.
3. Upload the newest `outputs/ai-slop-blocker-v*.zip`.
4. Complete the **Store listing** tab using `store/STORE_LISTING.md`.
5. Upload:
   - `store/assets/store-icon-128.png` as the required store icon.
   - `store/assets/screenshot-1280x800.png` as the required screenshot.
   - `store/assets/promo-small-440x280.png` as the required small promo tile.
6. Add the homepage, support, and privacy-policy URLs from the listing copy.
7. Complete the **Privacy practices** tab using `store/PRIVACY_ANSWERS.md`.
8. In **Distribution**, choose:
   - Free
   - Public
   - All regions, unless you want to limit availability
9. Add reviewer instructions:

   "Install the extension, open any normal webpage, and click the toolbar icon.
   Turn Blocking ON. To verify detection, open the repository's
   tests/manual-fixture.html through a local web server or visit a page
   containing an explicit phrase such as 'AI-generated'. The matching content
   container becomes invisible while retaining its space. Turn Blocking OFF to
   restore it. The extension does not require an account or external service."

10. Save the draft and resolve every dashboard warning.
11. Select **Submit for review**.

Google's review-process page currently warns that, as of April 2026, a surge
in submissions is causing extended review times.

## After Google approves it

1. Copy the public Chrome Web Store listing URL.
2. Replace the primary download link in `docs/index.html` with that URL.
3. Change the button text to `Add to Chrome`.
4. Remove the note saying the store link will appear after approval.
5. Commit and push the update. GitHub Pages will redeploy automatically.

## Review notes

- The extension requests access to pages because its single purpose requires
  reading and hiding matching page elements.
- Detection runs locally and no page content is transmitted.
- The optional Stripe link is a normal external link and does not unlock
  extension features.
- Keep all claims accurate. Do not claim the extension catches all AI content.

## Official references

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)
- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Set up distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
