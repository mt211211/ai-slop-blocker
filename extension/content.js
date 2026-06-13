(() => {
  "use strict";

  const HIDDEN_CLASS = "ai-slop-blocker-hidden";
  const MARKED_ATTRIBUTE = "data-ai-slop-blocker-hidden";
  const DEFAULT_STATE = { enabled: false };

  const DISCLOSURE_PATTERN = /\b(ai[- ]generated|generated (?:by|with|using) (?:an? )?ai|created (?:by|with|using) (?:an? )?ai|made with ai|written by ai|ai[- ]assisted|synthetic (?:media|content|image|video)|artificially generated|altered or synthetic|generative ai|ai overview|ai summary|powered by ai)\b/i;

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

  const blockedElements = new Set();
  let enabled = false;
  let observer;
  let scanQueued = false;

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
      if (!enabled || scanQueued) {
        return;
      }

      const hasRelevantChange = mutations.some((mutation) =>
        [...mutation.addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE)
      );

      if (hasRelevantChange) {
        scanQueued = true;
        window.setTimeout(() => {
          scanQueued = false;
          scan(document.body);
        }, 180);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    observer?.disconnect();
    observer = undefined;
  }

  function scan(root) {
    if (!enabled || !root) {
      return;
    }

    for (const selector of EXPLICIT_SELECTORS) {
      for (const element of root.querySelectorAll(selector)) {
        hide(resolveTarget(element, true));
      }
    }

    const candidates = new Set(root.querySelectorAll(ATTRIBUTE_SELECTORS.join(",")));
    collectShortTextElements(root, candidates);

    for (const element of candidates) {
      if (matchesDisclosure(element)) {
        hide(resolveTarget(element, false));
      }
    }

    reportCount();
  }

  function collectShortTextElements(root, candidates) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        const text = textNode.textContent?.trim() ?? "";
        if (
          text.length < 4 ||
          text.length > 180 ||
          !DISCLOSURE_PATTERN.test(text) ||
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

    return values.some((value) => value && DISCLOSURE_PATTERN.test(value.trim()));
  }

  function resolveTarget(marker, explicitMatch) {
    if (!marker || marker === document.body || marker === document.documentElement) {
      return null;
    }

    if (explicitMatch && !isPageContainer(marker)) {
      return marker;
    }

    const semanticTarget = marker.closest(
      "figure, article, [role='article'], [data-testid*='post' i], [class*='post' i], li"
    );
    if (semanticTarget && !isPageContainer(semanticTarget)) {
      return semanticTarget;
    }

    let current = marker;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const textLength = current.textContent?.trim().length ?? 0;
      const containsMedia = Boolean(current.querySelector?.("img, picture, video, canvas"));

      if (!isPageContainer(current) && containsMedia && textLength < 4000) {
        return current;
      }
      current = current.parentElement;
    }

    return isPageContainer(marker.parentElement) ? marker : marker.parentElement;
  }

  function isPageContainer(element) {
    return !element || ["HTML", "BODY", "MAIN"].includes(element.tagName);
  }

  function hide(element) {
    if (
      !element ||
      isPageContainer(element) ||
      element.hasAttribute(MARKED_ATTRIBUTE)
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

  function reportCount() {
    chrome.runtime.sendMessage({
      type: "AI_SLOP_PAGE_COUNT",
      enabled,
      count: blockedElements.size
    }).catch(() => {});
  }
})();

