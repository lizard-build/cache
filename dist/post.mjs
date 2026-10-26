import { createRequire as __lizardCreateRequire } from 'module'; const require = __lizardCreateRequire(import.meta.url);
import {
  compress,
  entryBase,
  prune,
  savesLocally,
  scopes,
  version
} from "./chunks/chunk-VMSU4FYI.mjs";
import {
  getBooleanInput,
  getInput,
  getState,
  info,
  warning
} from "./chunks/chunk-5ARPM26G.mjs";

// src/post.js
import fs from "fs";
import path from "path";
async function run() {
  const key = getState("primary-key");
  if (!key) return;
  if (getState("matched-key") === key) {
    info(`Cache hit occurred on the primary key ${key}, not saving cache.`);
    return;
  }
  if (getBooleanInput("lookup-only")) return;
  const paths = JSON.parse(getState("paths") || "[]");
  if (getState("mode") === "lizard" && savesLocally()) {
    const [ref] = scopes();
    if (!ref) return;
    const base = entryBase(ref, version(paths), key);
    if (fs.existsSync(`${base}.tar.zst`)) {
      info(`Cache entry ${key} already exists, not saving cache.`);
      return;
    }
    fs.mkdirSync(path.dirname(base), { recursive: true });
    const t = Date.now();
    const tmp = await compress(paths, base);
    if (!tmp) {
      warning("Path Validation Error: Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.");
      return;
    }
    fs.renameSync(`${tmp}.tar.zst`, `${base}.tar.zst`);
    fs.writeFileSync(`${base}.json.tmp`, JSON.stringify({ key, version: version(paths), ref, created: Date.now() }));
    fs.renameSync(`${base}.json.tmp`, `${base}.json`);
    const mb = (fs.statSync(`${base}.tar.zst`).size / 1048576).toFixed(1);
    info(`Cache saved to the Lizard runner's disk in ${((Date.now() - t) / 1e3).toFixed(1)}s (${mb} MB), key: ${key}`);
    prune();
    return;
  }
  try {
    const cache = await import("./chunks/cache-XRZCO4SM.mjs");
    const id = await cache.saveCache(paths, key, { uploadChunkSize: Number(getInput("upload-chunk-size")) || void 0 }, getBooleanInput("enableCrossOsArchive"));
    if (id !== -1) info(`Cache saved with key: ${key}`);
  } catch (e) {
    warning(e.message);
  }
}
run().catch((e) => warning(e.message));
