import { createRequire as __lizardCreateRequire } from 'module'; const require = __lizardCreateRequire(import.meta.url);
import {
  create,
  getBooleanInput,
  getInput,
  getMultilineInput
} from "./chunk-5ARPM26G.mjs";

// src/store.js
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
var ROOT = () => path.join(process.env.LIZARD_CACHE_DIR, "actions-cache");
var MAX_TOTAL_BYTES = 10 * 1024 ** 3;
function savesLocally() {
  try {
    return fs.readFileSync("/run/lizard/promote", "utf8").trim() === "promote";
  } catch {
    return false;
  }
}
function onLizard() {
  return process.env.LIZARD_CACHE_PERSISTENT === "true" && !!process.env.LIZARD_CACHE_DIR && (process.env.RUNNER_NAME || "").startsWith("lizard-");
}
function readInputs() {
  return {
    paths: getMultilineInput("path", { required: true }),
    key: getInput("key", { required: true }),
    restoreKeys: getMultilineInput("restore-keys"),
    lookupOnly: getBooleanInput("lookup-only"),
    failOnMiss: getBooleanInput("fail-on-cache-miss"),
    crossOs: getBooleanInput("enableCrossOsArchive"),
    chunk: Number(getInput("upload-chunk-size")) || void 0
  };
}
var sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
var version = (paths) => sha(["lizard-cache-v1", "zstd", ...paths].join("\n"));
function scopes() {
  const ref = process.env.GITHUB_REF || "";
  let def = "";
  try {
    const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (ev.repository?.default_branch) def = `refs/heads/${ev.repository.default_branch}`;
  } catch {
  }
  return [...new Set([ref, def].filter(Boolean))];
}
var scopeDir = (ref) => path.join(ROOT(), sha(ref).slice(0, 24));
var entryBase = (ref, ver, key) => path.join(scopeDir(ref), sha(`${ver}
${key}`).slice(0, 40));
function entries(ref, ver) {
  const dir = scopeDir(ref);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      if (m.version === ver && fs.existsSync(path.join(dir, n.replace(/\.json$/, ".tar.zst")))) out.push({ ...m, base: path.join(dir, n.replace(/\.json$/, "")) });
    } catch {
    }
  }
  return out.sort((a, b) => b.created - a.created);
}
function find(paths, key, restoreKeys) {
  const ver = version(paths);
  const refs = scopes();
  for (const ref of refs) {
    const base = entryBase(ref, ver, key);
    if (fs.existsSync(`${base}.tar.zst`) && fs.existsSync(`${base}.json`)) return { key, base, exact: true };
  }
  for (const prefix of restoreKeys) {
    for (const ref of refs) {
      const hit = entries(ref, ver).find((e) => e.key.startsWith(prefix));
      if (hit) return { key: hit.key, base: hit.base, exact: hit.key === key };
    }
  }
  return null;
}
function sh(script, args) {
  const r = spawnSync("bash", ["-o", "pipefail", "-c", script, "lizard-cache", ...args], { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`exit ${r.status}`);
}
var workspace = () => process.env.GITHUB_WORKSPACE || process.cwd();
var expand = (p) => {
  const neg = p.startsWith("!");
  let q = neg ? p.slice(1) : p;
  q = q.startsWith("~") ? path.join(os.homedir(), q.slice(1)) : path.resolve(workspace(), q);
  return (neg ? "!" : "") + q;
};
function extract(base) {
  sh('zstd -dc --quiet "$1" | tar -xf - -P -C "$2"', [`${base}.tar.zst`, workspace()]);
}
async function compress(paths, base) {
  const g = await create(paths.map(expand).join("\n"), { implicitDescendants: false });
  const files = (await g.glob()).map((p) => path.relative(workspace(), p) || ".");
  if (!files.length) return false;
  const tmp = `${base}.tmp-${process.pid}`;
  const list = `${tmp}.list`;
  fs.writeFileSync(list, files.join("\n") + "\n");
  try {
    sh('tar -cf - -P -C "$1" --files-from "$2" | zstd -T0 -1 --quiet -o "$3"', [workspace(), list, `${tmp}.tar.zst`]);
  } finally {
    fs.rmSync(list, { force: true });
  }
  return tmp;
}
function prune() {
  const all = [];
  for (const d of fs.readdirSync(ROOT(), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(ROOT(), d.name))) {
      if (!f.endsWith(".tar.zst")) continue;
      const p = path.join(ROOT(), d.name, f);
      const st = fs.statSync(p);
      all.push({ p, size: st.size, at: st.atimeMs });
    }
  }
  let total = all.reduce((a, e) => a + e.size, 0);
  for (const e of all.sort((a, b) => a.at - b.at)) {
    if (total <= MAX_TOTAL_BYTES) break;
    fs.rmSync(e.p, { force: true });
    fs.rmSync(e.p.replace(/\.tar\.zst$/, ".json"), { force: true });
    total -= e.size;
  }
}

export {
  savesLocally,
  onLizard,
  readInputs,
  version,
  scopes,
  entryBase,
  find,
  extract,
  compress,
  prune
};
