// lizard-build/cache, save (the action's post step, after a successful job). See store.js.
import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as store from "./store.js";

async function run() {
  const key = core.getState("primary-key");
  if (!key) return; // the main step did not run
  if (core.getState("matched-key") === key) {
    core.info(`Cache hit occurred on the primary key ${key}, not saving cache.`);
    return;
  }
  if (core.getBooleanInput("lookup-only")) return;
  const paths = JSON.parse(core.getState("paths") || "[]");
  if (core.getState("mode") === "lizard") {
    const [ref] = store.scopes();
    if (!ref) return;
    const base = store.entryBase(ref, store.version(paths), key);
    if (fs.existsSync(`${base}.tar.zst`)) { core.info(`Cache entry ${key} already exists, not saving cache.`); return; }
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const t = Date.now();
    const tmp = await store.compress(paths, base);
    if (!tmp) { core.warning("Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved."); return; }
    // The archive first, its metadata last: an entry without metadata is never restored.
    fs.renameSync(`${tmp}.tar.zst`, `${base}.tar.zst`);
    fs.writeFileSync(`${base}.json.tmp`, JSON.stringify({ key, version: store.version(paths), ref, created: Date.now() }));
    fs.renameSync(`${base}.json.tmp`, `${base}.json`);
    const mb = (fs.statSync(`${base}.tar.zst`).size / 1048576).toFixed(1);
    core.info(`Cache saved to the Lizard runner's disk in ${((Date.now() - t) / 1000).toFixed(1)}s (${mb} MB), key: ${key}`);
    store.prune();
    return;
  }
  try {
    const id = await cache.saveCache(paths, key, { uploadChunkSize: Number(core.getInput("upload-chunk-size")) || undefined }, core.getBooleanInput("enableCrossOsArchive"));
    if (id !== -1) core.info(`Cache saved with key: ${key}`);
  } catch (e) {
    core.warning(e.message);
  }
}

run().catch((e) => core.warning(e.message));
