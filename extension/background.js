const DEFAULT_STATE = { enabled: false };

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULT_STATE);
  await chrome.storage.local.set({ enabled: current.enabled });
  updateGlobalBadge(current.enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled } = await chrome.storage.local.get(DEFAULT_STATE);
  updateGlobalBadge(enabled);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    updateGlobalBadge(changes.enabled.newValue);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "AI_SLOP_PAGE_COUNT" || !sender.tab?.id) {
    return;
  }

  const text = message.enabled && message.count > 0
    ? String(Math.min(message.count, 999))
    : message.enabled
      ? ""
      : "OFF";

  chrome.action.setBadgeText({ tabId: sender.tab.id, text });
  chrome.action.setBadgeBackgroundColor({
    tabId: sender.tab.id,
    color: message.enabled ? "#f43f2f" : "#6b7280"
  });
});

function updateGlobalBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#f43f2f" : "#6b7280"
  });
}

