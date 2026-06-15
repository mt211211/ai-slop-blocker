const DEFAULT_STATE = { personalRules: [] };

const form = document.querySelector("#ruleForm");
const typeInput = document.querySelector("#ruleType");
const valueInput = document.querySelector("#ruleValue");
const hostInput = document.querySelector("#ruleHost");
const list = document.querySelector("#ruleList");
const emptyState = document.querySelector("#emptyState");
const ruleCount = document.querySelector("#ruleCount");
const clearButton = document.querySelector("#clearButton");
const notice = document.querySelector("#notice");

init();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const value = normalizeValue(typeInput.value, valueInput.value);
  const host = normalizeHost(hostInput.value);
  if (!value) {
    return;
  }

  const { personalRules } = await chrome.storage.local.get(DEFAULT_STATE);
  const rule = {
    id: crypto.randomUUID(),
    type: typeInput.value,
    value,
    host,
    label: valueInput.value.trim(),
    createdAt: Date.now()
  };

  await chrome.storage.local.set({ personalRules: deduplicate([...personalRules, rule]) });
  form.reset();
  flash("Filter added.");
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ personalRules: [] });
  flash("Personal filters cleared.");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.personalRules) {
    render(changes.personalRules.newValue ?? []);
  }
});

async function init() {
  const { personalRules } = await chrome.storage.local.get(DEFAULT_STATE);
  render(personalRules);
}

function render(rules) {
  list.replaceChildren();
  emptyState.hidden = rules.length > 0;
  clearButton.disabled = rules.length === 0;
  ruleCount.textContent = `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`;

  for (const rule of rules) {
    const item = document.createElement("li");
    const type = document.createElement("span");
    const copy = document.createElement("div");
    const value = document.createElement("strong");
    const detail = document.createElement("span");
    const remove = document.createElement("button");

    type.className = "rule-type";
    type.textContent = rule.type.replace("-url", "");
    copy.className = "rule-copy";
    value.textContent = rule.label || rule.value;
    detail.textContent = rule.host ? `Only on ${rule.host}` : "All websites";
    remove.className = "delete-rule";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeRule(rule.id));

    copy.append(value, detail);
    item.append(type, copy, remove);
    list.append(item);
  }
}

async function removeRule(id) {
  const { personalRules } = await chrome.storage.local.get(DEFAULT_STATE);
  await chrome.storage.local.set({
    personalRules: personalRules.filter((rule) => rule.id !== id)
  });
  flash("Filter removed.");
}

function normalizeValue(type, value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (type === "phrase") {
    return trimmed.toLowerCase();
  }

  try {
    const url = new URL(trimmed);
    const stableQueryKeys = ["v", "id", "post", "story", "video"];
    const stableQuery = stableQueryKeys
      .filter((key) => url.searchParams.has(key))
      .map((key) => `${key}=${url.searchParams.get(key)}`)
      .join("&");
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${stableQuery ? `?${stableQuery}` : ""}`;
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function normalizeHost(host) {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function deduplicate(rules) {
  const seen = new Set();
  return rules.filter((rule) => {
    const key = `${rule.type}|${rule.host}|${rule.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function flash(message) {
  notice.textContent = message;
  window.setTimeout(() => {
    notice.textContent = "";
  }, 2200);
}
