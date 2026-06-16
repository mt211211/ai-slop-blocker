# Chrome Web Store Submission Guide

Prepared June 13, 2026.

## Before uploading

1. Test the unpacked `extension` folder in Chrome.
2. Run `node scripts/validate.mjs`.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/package.ps1`.
4. Confirm the newest `outputs/ai-slop-blocker-v*.zip` contains `manifest.json` at its root.

## Update an existing published extension

Use this path after AI Slop Blocker is already live. Do not create a new item.

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
2. Select the existing **AI Slop Blocker** item.
3. Open the **Package** tab.
4. Select **Upload New Package**.
5. Upload the newest ZIP from `outputs`, for example
   `outputs/ai-slop-blocker-v0.4.1.zip`.
6. Confirm the dashboard accepts the package and shows the new manifest
   version.
7. Update the listing text or release notes if needed. For this version, use
   `store/UPDATE_NOTES_0.4.1.md`.
8. Check the **Privacy practices** tab. If permissions or data usage have not
   changed, the existing answers should still apply.
9. Save the draft and select **Submit for review**.

After Google approves the update, existing users will receive it automatically
through Chrome's normal extension update flow.

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

The public listing is:

https://chromewebstore.google.com/detail/ai-slop-blocker/cndicgfmgedmlhnaglnmehofkfnnbpmc

The landing page primary button now points to the Chrome Web Store listing.
Future package updates should continue through the existing item in the
Developer Dashboard.

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
