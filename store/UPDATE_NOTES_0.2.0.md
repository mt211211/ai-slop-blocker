# Version 0.2.0 Update Notes

## Chrome Web Store release notes

Improves per-item blocking and infinite-scroll support.

- Fixes an issue where an AI disclosure on X could hide the entire feed.
- Adds bounded detection for X posts.
- Adds detection for YouTube video cards and watch-page content.
- Improves detection of common generated-media labels and tools.
- Adds safety checks that prevent the extension from hiding page, feed, and
  multi-item containers.
- Scans newly loaded content without repeatedly rescanning the entire page.

## Upload

Upload `outputs/ai-slop-blocker-v0.2.0.zip` as a new package for the existing
Chrome Web Store item. The manifest version is already incremented to `0.2.0`.

