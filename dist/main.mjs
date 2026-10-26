import { createRequire as __lizardCreateRequire } from 'module'; const require = __lizardCreateRequire(import.meta.url);
import {
  extract,
  find,
  onLizard,
  readInputs,
  savesLocally
} from "./chunks/chunk-VMSU4FYI.mjs";
import {
  info,
  saveState,
  setFailed,
  setOutput,
  warning
} from "./chunks/chunk-5ARPM26G.mjs";

// src/main.js
async function run() {
  const i = readInputs();
  setOutput("cache-primary-key", i.key);
  saveState("primary-key", i.key);
  saveState("paths", JSON.stringify(i.paths));
  let matched;
  const github = async () => {
    const cache = await import("./chunks/cache-XRZCO4SM.mjs");
    return cache.restoreCache(i.paths.slice(), i.key, i.restoreKeys, { lookupOnly: i.lookupOnly }, i.crossOs);
  };
  const local = (hit) => {
    if (!i.lookupOnly) {
      const t = Date.now();
      extract(hit.base);
      info(`Cache restored from the Lizard runner's disk in ${((Date.now() - t) / 1e3).toFixed(1)}s, key: ${hit.key}`);
    } else info(`Cache found on the Lizard runner's disk, key: ${hit.key}`);
    return hit.key;
  };
  if (onLizard()) {
    saveState("mode", "lizard");
    const hit = find(i.paths, i.key, i.restoreKeys);
    if (hit?.exact || hit && savesLocally()) matched = local(hit);
    else {
      matched = await github().catch((e) => {
        warning(e.message);
        return void 0;
      });
      if (!matched && hit) matched = local(hit);
    }
  } else {
    saveState("mode", "github");
    matched = await github();
  }
  if (!matched) {
    if (i.failOnMiss) throw new Error(`Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${i.key}`);
    info(`Cache not found for input keys: ${[i.key, ...i.restoreKeys].join(", ")}`);
    setOutput("cache-hit", "false");
    return;
  }
  saveState("matched-key", matched);
  setOutput("cache-matched-key", matched);
  setOutput("cache-hit", String(matched === i.key));
}
run().catch((e) => setFailed(e.message));
