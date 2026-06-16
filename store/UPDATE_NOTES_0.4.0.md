# Version 0.4.0 Update Notes

## Chrome Web Store release notes

Improves automatic blocking across X/Twitter, YouTube Shorts, and generic
websites.

- Adds broader AI-media signals, including common AI-art hashtags and
  generator/tool names.
- Fixes YouTube Shorts-style renderers not being blanked.
- Applies the same nearest-content-card targeting logic to ordinary websites,
  not only X and YouTube.
- Keeps feed and layout guardrails so matching content is blanked without
  hiding whole timelines, lists, or pages.
- Keeps personal filters and the "Block something as AI" teaching picker from
  version 0.3.0.

## Upload

Upload `outputs/ai-slop-blocker-v0.4.0.zip` as a new package for the existing
Chrome Web Store item. The manifest version is already incremented to `0.4.0`.

