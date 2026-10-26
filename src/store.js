// lizard-build/cache: actions/cache with its entries on the Lizard runner's repository cache disk.
//
// On a Lizard runner whose cache disk lasts (LIZARD_CACHE_PERSISTENT=true, set by the runner VM):
// entries are tar+zstd files under $LIZARD_CACHE_DIR/actions-cache. Any job restores from there
// (its own ref, then the default branch, like GitHub's cache). Only a job whose writes the VM keeps
// -- a default-branch push, schedule or dispatch, decided before the job's code ran
// (/run/lizard/promote) -- saves there; every other job saves to GitHub's cache, which scopes it
// by ref on GitHub's side. Everywhere else (other runners, Lizard VMs that may get a fork's job)
// it is GitHub's cache service through @actions/cache, exactly like actions/cache.

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import * as core from "@actions/core";
import * as glob from "@actions/glob";

const ROOT = () => path.join(process.env.LIZARD_CACHE_DIR, "actions-cache");
const MAX_TOTAL_BYTES = 10 * 1024 ** 3;

/** Will what this job writes to the runner's disk be kept? (lizard-job-started's decision) */
function savesLocally() {
  try { return fs.readFileSync("/run/lizard/promote", "utf8").trim() === "promote"; } catch { return false; }
}

function onLizard() {
  return process.env.LIZARD_CACHE_PERSISTENT === "true" && !!process.env.LIZARD_CACHE_DIR
    && (process.env.RUNNER_NAME || "").startsWith("lizard-");
}

function readInputs() {
  return {
    paths: core.getMultilineInput("path", { required: true }),
    key: core.getInput("key", { required: true }),
    restoreKeys: core.getMultilineInput("restore-keys"),
    lookupOnly: core.getBooleanInput("lookup-only"),
    failOnMiss: core.getBooleanInput("fail-on-cache-miss"),
    crossOs: core.getBooleanInput("enableCrossOsArchive"),
    chunk: Number(core.getInput("upload-chunk-size")) || undefined,
  };
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
/** Entries are only for the same set of paths, as with GitHub's cache "version". */
const version = (paths) => sha(["lizard-cache-v1", "zstd", ...paths].join("\n"));

function scopes() {
  const ref = process.env.GITHUB_REF || "";
  let def = "";
  try {
    const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (ev.repository?.default_branch) def = `refs/heads/${ev.repository.default_branch}`;
  } catch { /* no event file */ }
  return [...new Set([ref, def].filter(Boolean))];
}
const scopeDir = (ref) => path.join(ROOT(), sha(ref).slice(0, 24));
const entryBase = (ref, ver, key) => path.join(scopeDir(ref), sha(`${ver}\n${key}`).slice(0, 40));

function entries(ref, ver) {
  const dir = scopeDir(ref);
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return []; }
  const out = [];
  for (const n of names) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8"));
      if (m.version === ver && fs.existsSync(path.join(dir, n.replace(/\.json$/, ".tar.zst")))) out.push({ ...m, base: path.join(dir, n.replace(/\.json$/, "")) });
    } catch { /* a half-written entry */ }
  }
  return out.sort((a, b) => b.created - a.created);
}

/** GitHub's order: the key exactly, then each restore key as a prefix; own ref before the default branch. */
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

const workspace = () => process.env.GITHUB_WORKSPACE || process.cwd();
/** A path pattern made absolute: ~ is the home directory, relative ones are the workspace's. */
const expand = (p) => {
  const neg = p.startsWith("!");
  let q = neg ? p.slice(1) : p;
  q = q.startsWith("~") ? path.join(os.homedir(), q.slice(1)) : path.resolve(workspace(), q);
  return (neg ? "!" : "") + q;
};

function extract(base) {
  sh('zstd -dc --quiet "$1" | tar -xf - -P -C "$2"', [`${base}.tar.zst`, workspace()]);
}

async function compress(paths, base) {
  const g = await glob.create(paths.map(expand).join("\n"), { implicitDescendants: false });
  const files = (await g.glob()).map((p) => path.relative(workspace(), p) || ".");
  if (!files.length) return false;
  const tmp = `${base}.tmp-${process.pid}`;
  const list = `${tmp}.list`;
  fs.writeFileSync(list, files.join("\n") + "\n");
  try {
    sh('tar -cf - -P -C "$1" --files-from "$2" | zstd -T0 -1 --quiet -o "$3"', [workspace(), list, `${tmp}.tar.zst`]);
  } finally { fs.rmSync(list, { force: true }); }
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

export { savesLocally, onLizard, readInputs, version, scopes, entryBase, find, extract, compress, prune };
