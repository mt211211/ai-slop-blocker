const DEFAULT_STATE = { enabled: false };

const toggle = document.querySelector("#toggle");
const statusText = document.querySelector("#statusText");
const statusHint = document.querySelector("#statusHint");
const count = document.querySelector("#count");
const pickerButton = document.querySelector("#pickerButton");
const rulesButton = document.querySelector("#rulesButton");

init();

async function init() {
  const { enabled } = await chrome.storage.local.get(DEFAULT_STATE);
  render(enabled);
  await refreshPageCount();
}

toggle.addEventListener("click", async () => {
  const nextEnabled = toggle.getAttribute("aria-checked") !== "true";
  await chrome.storage.local.set({ enabled: nextEnabled });
  render(nextEnabled);
  window.setTimeout(refreshPageCount, 100);
});

pickerButton.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  await chrome.storage.local.set({ enabled: true });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "AI_SLOP_START_PICKER" });
    window.close();
  } catch {
    statusHint.textContent = "This page cannot be picked. Try a normal website.";
  }
});

rulesButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.enabled) {
    render(Boolean(changes.enabled.newValue));
  }
});

async function refreshPageCount() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  try {
    const pageStatus = await chrome.tabs.sendMessage(tab.id, {
      type: "AI_SLOP_GET_STATUS"
    });
    count.textContent = String(pageStatus?.count ?? 0);
  } catch {
    count.textContent = "0";
  }
}

function render(enabled) {
  toggle.setAttribute("aria-checked", String(enabled));
  toggle.setAttribute(
    "aria-label",
    enabled ? "Turn AI Slop Blocker off" : "Turn AI Slop Blocker on"
  );
  statusText.textContent = enabled ? "Blocking is ON" : "Blocking is OFF";
  statusHint.textContent = enabled
    ? "Explicit slop gets the blank-space treatment."
    : "The slop currently roams free.";

  if (!enabled) {
    count.textContent = "0";
  }
}
