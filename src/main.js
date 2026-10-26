// lizard-build/cache, restore (the action's main step). See store.js.
import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as store from "./store.js";

async function run() {
  const i = store.readInputs();
  core.setOutput("cache-primary-key", i.key);
  core.saveState("primary-key", i.key);
  core.saveState("paths", JSON.stringify(i.paths));
  let matched;
  if (store.onLizard()) {
    core.saveState("mode", "lizard");
    const hit = store.find(i.paths, i.key, i.restoreKeys);
    if (hit) {
      if (!i.lookupOnly) {
        const t = Date.now();
        store.extract(hit.base);
        core.info(`Cache restored from the Lizard runner's disk in ${((Date.now() - t) / 1000).toFixed(1)}s, key: ${hit.key}`);
      } else core.info(`Cache found on the Lizard runner's disk, key: ${hit.key}`);
      matched = hit.key;
    }
  } else {
    core.saveState("mode", "github");
    matched = await cache.restoreCache(i.paths.slice(), i.key, i.restoreKeys, { lookupOnly: i.lookupOnly }, i.crossOs);
  }
  if (!matched) {
    if (i.failOnMiss) throw new Error(`Failed to restore cache entry. Exiting as fail-on-cache-miss is set. Input key: ${i.key}`);
    core.info(`Cache not found for input keys: ${[i.key, ...i.restoreKeys].join(", ")}`);
    core.setOutput("cache-hit", "false");
    return;
  }
  core.saveState("matched-key", matched);
  core.setOutput("cache-matched-key", matched);
  core.setOutput("cache-hit", String(matched === i.key));
}

run().catch((e) => core.setFailed(e.message));
