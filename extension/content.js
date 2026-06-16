(() => {
  "use strict";

  const HIDDEN_CLASS = "ai-slop-blocker-hidden";
  const MARKED_ATTRIBUTE = "data-ai-slop-blocker-hidden";
  const PICKER_CLASS = "ai-slop-blocker-picker-target";
  const UI_ATTRIBUTE = "data-ai-slop-blocker-ui";
  const DEFAULT_STATE = { enabled: false, personalRules: [] };

  const DISCLOSURE_PATTERN = /\b(ai[- ]generated|#aigenerated|generated (?:by|with|using) (?:an? )?ai|created (?:by|with|using) (?:an? )?ai|made (?:by|with|using) (?:an? )?ai|written by ai|ai[- ]assisted|synthetic (?:media|content|image|video)|artificially generated|altered or synthetic|generative ai|ai overview|ai summary|powered by ai|ai (?:art|artwork|image|images|video|videos|animation|music|voice|film|movie|short film|trailer|commercial)|midjourney|dall[- ]?e|stable diffusion|sora ai|openai sora|veo 3|runway gen)\b/i;
  const AI_MEDIA_PATTERN = /(?:#(?:aiart|aiartcommunity|aivideo|aivideos|aianimation|aimusic|aifilm|aimovie|aiimages|aigenerated|generativeai|midjourney|stablediffusion|dalle|sora|runwayml|veo3|klingai|pikalabs)\b|\b(?:ai[- ]generated|ai art|ai artwork|ai image|ai images|ai video|ai videos|ai animation|ai music|ai film|ai movie|ai short|made with ai|generated with ai|made in ai|midjourney|stable diffusion|dall[- ]?e|sora|openai sora|runway gen|runwayml|veo 3|google veo|kling ai|pika labs|hailuo|luma dream machine|grok image|made with grok|generated with grok)\b)/i;
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
    "ytd-reel-video-renderer",
    "yt-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "yt-lockup-view-model"
  ].join(",");
  const GENERIC_ITEM_SELECTOR = [
    "article",
    "figure",
    "li",
    "[role='article']",
    "[role='listitem']",
    "[data-testid*='post' i]",
    "[data-testid*='card' i]",
    "[data-testid*='item' i]",
    "[class*='post' i]",
    "[class*='card' i]",
    "[class*='tile' i]",
    "[class*='item' i]",
    "[class*='video' i]",
    "[class*='entry' i]"
  ].join(",");

  const REPEATED_ITEM_SELECTOR = [
    "article",
    "li",
    "[role='listitem']",
    "article[data-testid='tweet']",
    "article[role='article']",
    YOUTUBE_CARD_SELECTOR,
    "[data-testid*='post' i]",
    "[data-testid*='card' i]",
    "[class*='post' i]",
    "[class*='card' i]",
    "[class*='tile' i]"
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
    "#contents",
    `[${UI_ATTRIBUTE}]`
  ].join(",");

  const blockedElements = new Set();
  const pendingRoots = new Set();
  let personalRules = [];
  let enabled = false;
  let observer;
  let scanTimer;
  let cachedHost;
  let pickerActive = false;
  let pickerTarget;
  let pickerNotice;
  let pickerChooser;

  chrome.storage.local.get(DEFAULT_STATE).then(({ enabled: storedEnabled, personalRules: storedRules }) => {
    personalRules = storedRules ?? [];
    setEnabled(storedEnabled);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.enabled) {
      setEnabled(Boolean(changes.enabled.newValue));
    }

    if (changes.personalRules) {
      personalRules = changes.personalRules.newValue ?? [];
      if (enabled) {
        revealAll();
        scan(document.body);
      }
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "AI_SLOP_GET_STATUS") {
      pruneDisconnectedElements();
      sendResponse({ enabled, count: blockedElements.size });
    }

    if (message?.type === "AI_SLOP_START_PICKER") {
      startPicker();
      sendResponse({ started: true });
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

    applyPersonalRules(root);

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
    if (
      !(element instanceof Element) ||
      element.closest(`.${HIDDEN_CLASS}`) ||
      element.closest(`[${UI_ATTRIBUTE}]`)
    ) {
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

    if (AI_MEDIA_PATTERN.test(value) && hasContentContext(element)) {
      return true;
    }

    const host = getCurrentHost();
    const isYouTube = host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
    if (!isYouTube || !YOUTUBE_MEDIA_PATTERN.test(value)) {
      return false;
    }

    return Boolean(element?.closest?.(`${YOUTUBE_CARD_SELECTOR}, ytd-watch-metadata, #above-the-fold, ytd-shorts`));
  }

  function resolveTargets(marker, explicitMatch) {
    if (!marker || isProtectedContainer(marker)) {
      return [];
    }

    const siteTargets = resolveSiteTargets(marker);
    if (siteTargets !== null) {
      return siteTargets;
    }

    const genericTarget = resolveGenericItemTarget(marker);
    if (genericTarget) {
      return [genericTarget];
    }

    if (explicitMatch) {
      return [marker];
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

      const watchMetadata = marker.closest("ytd-watch-metadata, #above-the-fold, ytd-shorts");
      if (watchMetadata) {
        const player = document.querySelector("#player-container-outer, #player, #shorts-player, ytd-player");
        return player ? [watchMetadata, player] : [watchMetadata];
      }

      return [];
    }

    return null;
  }

  function resolveGenericItemTarget(marker) {
    const target = marker.closest?.(GENERIC_ITEM_SELECTOR);
    return target && !isUnsafeTarget(target) ? target : null;
  }

  function hasContentContext(element) {
    if (
      !(element instanceof Element) ||
      element.closest("header, footer, nav, [role='navigation'], [role='menu']")
    ) {
      return false;
    }

    const siteTarget = resolveSiteTargets(element)?.find((target) => !isUnsafeTarget(target));
    return Boolean(
      siteTarget ||
      resolveGenericItemTarget(element) ||
      element.closest?.("figure") ||
      element.querySelector?.("img, picture, video, canvas") ||
      element.closest?.("a[href*='/watch'], a[href*='/shorts/'], a[href*='/status/']")
    );
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
    return (
      !element ||
      element.matches?.(PROTECTED_CONTAINER_SELECTOR) ||
      Boolean(element.closest?.(`[${UI_ATTRIBUTE}]`))
    );
  }

  function isUnsafeTarget(element) {
    if (
      isProtectedContainer(element) ||
      element.closest("header, footer, nav, [role='navigation']") ||
      element.querySelectorAll(REPEATED_ITEM_SELECTOR).length > 1
    ) {
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

  function applyPersonalRules(root) {
    if (personalRules.length === 0) {
      return;
    }

    const host = getCurrentHost();
    const relevantRules = personalRules.filter((rule) => matchesRuleHost(rule.host, host));
    if (relevantRules.length === 0) {
      return;
    }

    for (const rule of relevantRules) {
      if (rule.type === "phrase") {
        applyPhraseRule(root, rule);
      }

      if (rule.type === "content-url" || rule.type === "creator-url") {
        for (const link of queryAllIncludingRoot(root, "a[href]")) {
          if (normalizeUrl(link.href) === rule.value) {
            hideTargets(resolveTargets(link, false));
          }
        }
      }
    }
  }

  function applyPhraseRule(root, rule) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const parent = textNode.parentElement;
        const text = textNode.textContent?.toLowerCase() ?? "";
        return parent && !parent.closest(`[${UI_ATTRIBUTE}]`) && text.includes(rule.value)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });

    while (walker.nextNode()) {
      hideTargets(resolveTargets(walker.currentNode.parentElement, false));
    }
  }

  function matchesRuleHost(ruleHost, currentHost) {
    if (!ruleHost) {
      return true;
    }

    const normalizedRuleHost = normalizeHost(ruleHost);
    const normalizedCurrentHost = normalizeHost(currentHost);
    return normalizedCurrentHost === normalizedRuleHost || normalizedCurrentHost.endsWith(`.${normalizedRuleHost}`);
  }

  function startPicker() {
    stopPicker();
    if (!enabled) {
      setEnabled(true);
    }
    pickerActive = true;

    pickerNotice = createPickerUi("div", "ai-slop-blocker-picker-notice");
    pickerNotice.textContent = "Pick one AI item. Press Esc to cancel.";
    document.documentElement.append(pickerNotice);

    document.addEventListener("mouseover", handlePickerHover, true);
    document.addEventListener("click", handlePickerClick, true);
    document.addEventListener("keydown", handlePickerKeydown, true);
  }

  function handlePickerHover(event) {
    if (!pickerActive || event.target.closest?.(`[${UI_ATTRIBUTE}]`)) {
      return;
    }

    const nextTarget = resolvePickerTarget(event.target);
    if (nextTarget === pickerTarget) {
      return;
    }

    pickerTarget?.classList.remove(PICKER_CLASS);
    pickerTarget = nextTarget;
    pickerTarget?.classList.add(PICKER_CLASS);
  }

  function handlePickerClick(event) {
    if (!pickerActive || event.target.closest?.(`[${UI_ATTRIBUTE}]`)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const target = pickerTarget ?? resolvePickerTarget(event.target);
    if (!target) {
      return;
    }

    showRuleChooser(target);
  }

  function handlePickerKeydown(event) {
    if (event.key === "Escape") {
      stopPicker();
    }
  }

  function resolvePickerTarget(marker) {
    const siteTargets = resolveSiteTargets(marker);
    const siteTarget = siteTargets?.find((target) => !isUnsafeTarget(target));
    if (siteTarget) {
      return siteTarget;
    }

    const genericTarget = marker.closest?.(GENERIC_ITEM_SELECTOR);
    if (genericTarget && !isUnsafeTarget(genericTarget)) {
      return genericTarget;
    }

    return resolveTargets(marker, false).find((target) => target && !isUnsafeTarget(target)) ?? null;
  }

  function showRuleChooser(target) {
    pickerTarget?.classList.remove(PICKER_CLASS);
    pickerTarget = target;
    pickerTarget.classList.add(PICKER_CLASS);
    pickerNotice?.remove();
    pickerChooser?.remove();

    const contentRule = buildContentRule(target);
    const creatorRule = buildCreatorRule(target);

    pickerChooser = createPickerUi("div", "ai-slop-blocker-picker-chooser");
    const title = createPickerUi("strong");
    const copy = createPickerUi("span");
    const actions = createPickerUi("div", "ai-slop-blocker-picker-actions");
    const itemButton = createPickerButton("Block this item", contentRule);
    const creatorButton = createPickerButton(
      creatorRule ? `Block ${creatorRule.label}` : "Creator not detected",
      creatorRule
    );
    const cancelButton = createPickerButton("Cancel", null, true);

    title.textContent = "Teach AI Slop Blocker";
    copy.textContent = "What should your personal filter remember?";
    actions.append(itemButton, creatorButton, cancelButton);
    pickerChooser.append(title, copy, actions);
    document.documentElement.append(pickerChooser);
  }

  function createPickerButton(label, rule, cancel = false) {
    const button = createPickerUi("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = !cancel && !rule;
    button.addEventListener("click", async () => {
      if (cancel) {
        stopPicker();
        return;
      }

      await savePersonalRule(rule);
      hide(pickerTarget);
      stopPicker();
      reportCount();
    });
    return button;
  }

  async function savePersonalRule(rule) {
    const { personalRules: latestRules } = await chrome.storage.local.get(DEFAULT_STATE);
    const exists = latestRules.some((existing) =>
      existing.type === rule.type &&
      existing.host === rule.host &&
      existing.value === rule.value
    );

    if (!exists) {
      personalRules = [...latestRules, rule];
      await chrome.storage.local.set({
        personalRules
      });

      if (enabled) {
        revealAll();
        scan(document.body);
      }
    }
  }

  function buildContentRule(target) {
    const host = getCurrentHost();
    const link = findContentLink(target);
    const value = link ? normalizeUrl(link.href) : "";

    if (value) {
      return createRule("content-url", value, truncateText(target.textContent) || "Selected item", host);
    }

    const phrase = compactText(target.textContent).slice(0, 80).toLowerCase();
    return phrase ? createRule("phrase", phrase, phrase, host) : null;
  }

  function buildCreatorRule(target) {
    const link = findCreatorLink(target);
    if (!link) {
      return null;
    }

    const label = truncateText(link.textContent, 40) || "this creator";
    return createRule("creator-url", normalizeUrl(link.href), label, getCurrentHost());
  }

  function createRule(type, value, label, host) {
    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      value,
      label,
      host: normalizeHost(host),
      createdAt: Date.now()
    };
  }

  function findContentLink(target) {
    const host = getCurrentHost();

    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      return target.querySelector("a[href*='/status/']");
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      return target.querySelector("a[href*='/watch'], a[href*='/shorts/']");
    }

    return [...target.querySelectorAll("a[href]")].find((link) => {
      try {
        const url = new URL(link.href);
        return url.hostname === location.hostname && url.pathname !== "/";
      } catch {
        return false;
      }
    });
  }

  function findCreatorLink(target) {
    const host = getCurrentHost();

    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      const ignored = new Set(["home", "explore", "messages", "notifications", "search", "settings"]);
      return [...target.querySelectorAll("a[href]")].find((link) => {
        try {
          const pathParts = new URL(link.href).pathname.split("/").filter(Boolean);
          return pathParts.length === 1 && !ignored.has(pathParts[0].toLowerCase());
        } catch {
          return false;
        }
      });
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      return target.querySelector(
        "a[href^='/@'], a[href^='/channel/'], #channel-name a[href], ytd-channel-name a[href]"
      );
    }

    return target.querySelector(
      "[rel='author'][href], [class*='author' i] a[href], [class*='channel' i] a[href], [data-testid*='author' i] a[href]"
    );
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value, location.href);
      const isLocalFixture = ["127.0.0.1", "localhost"].includes(url.hostname);
      const host = isLocalFixture ? getCurrentHost() : url.hostname;
      const stableQueryKeys = ["v", "id", "post", "story", "video"];
      const stableQuery = stableQueryKeys
        .filter((key) => url.searchParams.has(key))
        .map((key) => `${key}=${url.searchParams.get(key)}`)
        .join("&");
      return `${normalizeHost(host)}${url.pathname.replace(/\/$/, "")}${stableQuery ? `?${stableQuery}` : ""}`;
    } catch {
      return value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  }

  function normalizeHost(value) {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }

  function truncateText(value, maxLength = 55) {
    const compact = compactText(value);
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
  }

  function compactText(value) {
    return (value ?? "").replace(/\s+/g, " ").trim();
  }

  function createPickerUi(tagName, className = "") {
    const element = document.createElement(tagName);
    element.setAttribute(UI_ATTRIBUTE, "true");
    if (className) {
      element.className = className;
    }
    return element;
  }

  function stopPicker() {
    pickerActive = false;
    pickerTarget?.classList.remove(PICKER_CLASS);
    pickerTarget = undefined;
    pickerNotice?.remove();
    pickerChooser?.remove();
    pickerNotice = undefined;
    pickerChooser = undefined;
    document.removeEventListener("mouseover", handlePickerHover, true);
    document.removeEventListener("click", handlePickerClick, true);
    document.removeEventListener("keydown", handlePickerKeydown, true);
  }
})();
