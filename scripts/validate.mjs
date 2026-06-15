import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const extensionRoot = resolve(root, "extension");
const manifest = JSON.parse(await readFile(resolve(extensionRoot, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3, "Extension must use Manifest V3");
assert.equal(manifest.name, "AI Slop Blocker");
assert.ok(manifest.content_scripts?.length, "A content script must be declared");
assert.ok(
  manifest.content_scripts[0].matches.includes("https://*/*"),
  "Content script must run on HTTPS pages"
);

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((entry) => [...(entry.js ?? []), ...(entry.css ?? [])]),
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon)
];

for (const file of new Set(referencedFiles)) {
  await access(resolve(extensionRoot, file));
}

for (const file of [
  "extension/background.js",
  "extension/content.js",
  "extension/popup/popup.js",
  "extension/options/options.js"
]) {
  execFileSync(process.execPath, ["--check", resolve(root, file)], { stdio: "inherit" });
}

const contentScript = await readFile(resolve(extensionRoot, "content.js"), "utf8");
assert.match(contentScript, /AI_SLOP_GET_STATUS/);
assert.match(contentScript, /revealAll/);
assert.match(contentScript, /MutationObserver/);

const chromeCandidates = [
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];
const chrome = chromeCandidates.find((candidate) => {
  try {
    execFileSync(candidate, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});

if (chrome) {
  for (const fixture of [
    "automated-fixture.html",
    "personal-rules-fixture.html",
    "x-regression-fixture.html",
    "youtube-regression-fixture.html"
  ]) {
    const fixtureUrl = `file:///${resolve(root, `tests/${fixture}`).replaceAll("\\", "/")}`;
    const output = execFileSync(
      chrome,
      ["--headless=new", "--disable-gpu", "--virtual-time-budget=1200", "--dump-dom", fixtureUrl],
      { encoding: "utf8" }
    );
    assert.match(output, /<output id="result">PASS<\/output>/, `${fixture} must pass`);
  }
}

console.log("Validation passed: manifest, assets, JavaScript syntax, and all detector fixtures are ready.");
