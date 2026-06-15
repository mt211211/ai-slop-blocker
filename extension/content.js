(() => {
  "use strict";

  const HIDDEN_CLASS = "ai-slop-blocker-hidden";
  const MARKED_ATTRIBUTE = "data-ai-slop-blocker-hidden";
  const DEFAULT_STATE = { enabled: false };

  const DISCLOSURE_PATTERN = /\b(ai[- ]generated|#aigenerated|generated (?:by|with|using) (?:an? )?ai|created (?:by|with|using) (?:an? )?ai|made (?:by|with|using) (?:an? )?ai|written by ai|ai[- ]assisted|synthetic (?:media|content|image|video)|artificially generated|altered or synthetic|generative ai|ai overview|ai summary|powered by ai|ai (?:art|artwork|image|images|video|videos|animation|music|voice|film|movie|short film|trailer|commercial)|midjourney|dall[- ]?e|stable diffusion|sora ai|openai sora|veo 3|runway gen)\b/i;
  const YOUTUBE_MEDIA_PATTERN = /\b(?:ai\b.{0,45}\b(?:art|animation|commercial|film|movie|music|short film|trailer|video)|(?:art|animation|commercial|film|movie|music|short film|trailer|video)\b.{0,45}\bai)\b/i;

  const EXPLICIT_SELECTORS = [
    "[data-ai-generated='true']",
    "[data-generated-by-ai='true']",
    "[data-synthetic-media='true']",
    "[data-content-origin='ai']",
    "[data-testid*='ai-overview' i]",
    "[data-testid*='ai-generated' i]",
    "[class*='ai-overview' i]",
    "[id*='ai-overview' i]"
  ];

  const ATTRIBUTE_SELECTORS = [
    "[aria-label]",
    "[title]",
    "img[alt]",
    "video[aria-label]",
    "figure",
    "figcaption"
  ];

  const X_POST_SELECTOR = "article[data-testid='tweet']";
  const YOUTUBE_CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-reel-item-renderer",
    "yt-lockup-view-model"
  ].join(",");

  const REPEATED_ITEM_SELECTOR = [
    "article",
    "li",
    "[role='listitem']",
    "article[data-testid='tweet']",
    "article[role='article']",
    YOUTUBE_CARD_SELECTOR
  ].join(",");

  const PROTECTED_CONTAINER_SELECTOR = [
    "html",
    "body",
    "main",
    "[role='main']",
    "[role='feed']",
    "[role='list']",
    "[aria-label*='timeline' i]",
    "[aria-label*='feed' i]",
    "[data-testid='primaryColumn']",
    "[data-testid='cellInnerDiv']",
    "header",
    "footer",
    "nav",
    "ytd-app",
    "ytd-page-manager",
    "ytd-browse",
    "ytd-watch-flexy",
    "ytd-rich-grid-renderer",
    "ytd-section-list-renderer",
    "#contents"
  ].join(",");

  const blockedElements = new Set();
  const pendingRoots = new Set();
  let enabled = false;
  let observer;
  let scanTimer;
  let cachedHost;

  chrome.storage.local.get(DEFAULT_STATE).then(({ enabled: storedEnabled }) => {
    setEnabled(storedEnabled);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.enabled) {
      setEnabled(Boolean(changes.enabled.newValue));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AI_SLOP_GET_STATUS") {
      pruneDisconnectedElements();
      sendResponse({ enabled, count: blockedElements.size });
    }
  });

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;

    if (enabled) {
      startObserver();
      scan(document.body);
    } else {
      revealAll();
      stopObserver();
    }

    reportCount();
  }

  function startObserver() {
    if (observer || !document.documentElement) {
      return;
    }

    observer = new MutationObserver((mutations) => {
      if (!enabled) {
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          queueScan(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            queueScan(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            queueScan(node.parentElement);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      attributeFilter: [
        "alt",
        "aria-label",
        "data-ai-generated",
        "data-content-origin",
        "data-generated-by-ai",
        "data-synthetic-media",
        "title"
      ],
      attributes: true,
      childList: true,
      subtree: true
    });
  }

  function queueScan(root) {
    for (const pendingRoot of pendingRoots) {
      if (pendingRoot.contains(root)) {
        return;
      }
      if (root.contains(pendingRoot)) {
        pendingRoots.delete(pendingRoot);
      }
    }

    pendingRoots.add(root);
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      const roots = [...pendingRoots];
      pendingRoots.clear();
      scanTimer = undefined;

      for (const pendingRoot of roots) {
        if (pendingRoot.isConnected) {
          scan(pendingRoot, false);
        }
      }

      pruneDisconnectedElements();
      reportCount();
    }, 160);
  }

  function stopObserver() {
    observer?.disconnect();
    observer = undefined;
    pendingRoots.clear();
    window.clearTimeout(scanTimer);
    scanTimer = undefined;
  }

  function scan(root, shouldReport = true) {
    if (!enabled || !root) {
      return;
    }

    for (const selector of EXPLICIT_SELECTORS) {
      for (const element of queryAllIncludingRoot(root, selector)) {
        hideTargets(resolveTargets(element, true));
      }
    }

    const candidates = new Set(queryAllIncludingRoot(root, ATTRIBUTE_SELECTORS.join(",")));
    collectShortTextElements(root, candidates);

    for (const element of candidates) {
      if (matchesDisclosure(element)) {
        hideTargets(resolveTargets(element, false));
      }
    }

    if (shouldReport) {
      pruneDisconnectedElements();
      reportCount();
    }
  }

  function queryAllIncludingRoot(root, selector) {
    const matches = [];

    if (root instanceof Element && root.matches(selector)) {
      matches.push(root);
    }

    if (root.querySelectorAll) {
      matches.push(...root.querySelectorAll(selector));
    }

    return matches;
  }

  function collectShortTextElements(root, candidates) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const text = textNode.textContent?.trim() ?? "";
        if (
          text.length < 4 ||
          text.length > 240 ||
          !matchesDetectionPattern(text, textNode.parentElement) ||
          !textNode.parentElement
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      candidates.add(walker.currentNode.parentElement);
    }
  }

  function matchesDisclosure(element) {
    if (!(element instanceof Element) || element.closest(`.${HIDDEN_CLASS}`)) {
      return false;
    }

    const values = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
      element.childElementCount <= 4 ? element.textContent : ""
    ];

    return values.some((value) => value && matchesDetectionPattern(value.trim(), element));
  }

  function matchesDetectionPattern(value, element) {
    if (DISCLOSURE_PATTERN.test(value)) {
      return true;
    }

    const host = getCurrentHost();
    const isYouTube = host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
    if (!isYouTube || !YOUTUBE_MEDIA_PATTERN.test(value)) {
      return false;
    }

    return Boolean(element?.closest?.(`${YOUTUBE_CARD_SELECTOR}, ytd-watch-metadata, #above-the-fold`));
  }

  function resolveTargets(marker, explicitMatch) {
    if (!marker || isProtectedContainer(marker)) {
      return [];
    }

    const siteTargets = resolveSiteTargets(marker);
    if (siteTargets !== null) {
      return siteTargets;
    }

    if (explicitMatch) {
      return [marker];
    }

    const semanticTarget = marker.closest("figure, article");
    if (semanticTarget && !isProtectedContainer(semanticTarget)) {
      return [semanticTarget];
    }

    let current = marker;
    for (let depth = 0; current && depth < 3; depth += 1) {
      const textLength = current.textContent?.trim().length ?? 0;
      const containsMedia = Boolean(current.querySelector?.("img, picture, video, canvas"));

      if (!isProtectedContainer(current) && containsMedia && textLength < 3000) {
        return [current];
      }
      current = current.parentElement;
    }

    return isProtectedContainer(marker.parentElement) ? [marker] : [marker.parentElement];
  }

  function resolveSiteTargets(marker) {
    const host = getCurrentHost();

    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      const post = marker.closest(X_POST_SELECTOR);
      return post ? [post] : [];
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      const card = marker.closest(YOUTUBE_CARD_SELECTOR);
      if (card) {
        return [card];
      }

      const watchMetadata = marker.closest("ytd-watch-metadata, #above-the-fold");
      if (watchMetadata) {
        const player = document.querySelector("#player-container-outer, #player, ytd-player");
        return player ? [watchMetadata, player] : [watchMetadata];
      }

      return [];
    }

    return null;
  }

  function getCurrentHost() {
    if (cachedHost !== undefined) {
      return cachedHost;
    }

    const fixtureHost = document.querySelector("meta[name='ai-slop-blocker-test-host']")
      ?.getAttribute("content")
      ?.toLowerCase();
    const isLocalFixture = !location.hostname || ["127.0.0.1", "localhost"].includes(location.hostname);

    cachedHost = isLocalFixture && fixtureHost
      ? fixtureHost
      : location.hostname.toLowerCase();
    return cachedHost;
  }

  function hideTargets(targets) {
    for (const target of new Set(targets)) {
      hide(target);
    }
  }

  function isProtectedContainer(element) {
    return !element || element.matches?.(PROTECTED_CONTAINER_SELECTOR);
  }

  function isUnsafeTarget(element) {
    if (isProtectedContainer(element) || element.querySelectorAll(REPEATED_ITEM_SELECTOR).length > 1) {
      return true;
    }

    const main = document.querySelector("main, [role='main']");
    if (main && element !== main && element.contains(main)) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return (
      rect.width >= document.documentElement.clientWidth * 0.9 &&
      rect.height >= window.innerHeight * 1.5
    );
  }

  function hide(element) {
    if (
      !element ||
      isUnsafeTarget(element) ||
      element.hasAttribute(MARKED_ATTRIBUTE) ||
      element.closest(`.${HIDDEN_CLASS}`)
    ) {
      return;
    }

    element.classList.add(HIDDEN_CLASS);
    element.setAttribute(MARKED_ATTRIBUTE, "true");
    blockedElements.add(element);
  }

  function revealAll() {
    for (const element of blockedElements) {
      element.classList.remove(HIDDEN_CLASS);
      element.removeAttribute(MARKED_ATTRIBUTE);
    }
    blockedElements.clear();
  }

  function pruneDisconnectedElements() {
    for (const element of blockedElements) {
      if (!element.isConnected) {
        blockedElements.delete(element);
      }
    }
  }

  function reportCount() {
    chrome.runtime.sendMessage({
      type: "AI_SLOP_PAGE_COUNT",
      enabled,
      count: blockedElements.size
    }).catch(() => {});
  }
})();
