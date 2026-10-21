#!/usr/bin/env node
/**
 * Regression guard for the server dependencies our API routes load.
 *
 * Every route that imports `@/lib/firebaseAdmin` relies on `firebase-admin`
 * being loaded with plain CommonJS `require()` in the Vercel function runtime.
 * That chain is `firebase-admin/auth` -> `jwks-rsa` (CJS) -> `jose`, and jose
 * 5/6 are ESM-only, so a runtime without `require(esm)` died with:
 *
 *   ERR_REQUIRE_ESM: require() of ES Module .../jose/dist/webapi/index.js
 *   from .../jwks-rsa/src/utils.js not supported
 *
 * which surfaced as an empty HTTP 500 on every protected route. It stayed
 * invisible locally because Node enables `require(esm)` by default here.
 *
 * `npm run verify:deps` therefore runs this file with
 * `--no-experimental-require-module` to reproduce the stricter loader. jose is
 * pinned to its last CommonJS release via `overrides` in package.json; if that
 * pin is ever removed or bumped to 5+, this check fails before deploying.
 */
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

if (process.features.require_module) {
  console.warn(
    "WARNING: this runtime can require() ES modules, so the check below is not\n" +
      "         faithful to production. Run `npm run verify:deps` instead.\n"
  );
}

const results = [];
const jwksRsaRequire = createRequire(require.resolve("jwks-rsa/package.json"));

function check(name, fn) {
  try {
    const detail = fn();
    results.push(true);
    console.log(`PASS  ${name}${detail ? ` -> ${detail}` : ""}`);
  } catch (error) {
    results.push(false);
    console.log(
      `FAIL  ${name} -> ${error.code ?? error.name}: ${String(error.message).split("\n")[0]}`
    );
  }
}

console.log(
  `node ${process.version} | require(esm) enabled: ${process.features.require_module}\n`
);

check("require('firebase-admin/auth')", () => {
  const auth = require("firebase-admin/auth");
  assert.strictEqual(typeof auth.getAuth, "function");
  return "getAuth is exported";
});

check("initializeApp() + getAuth()  [/api/health adminInit probe]", () => {
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const app = initializeApp({ projectId: "verify-deps" }, "verify-deps");
  assert.ok(getAuth(app), "getAuth() returned nothing");
  deleteApp(app);
  return "Admin SDK initialises";
});

check("require('jwks-rsa')  [executes its top-level require('jose')]", () => {
  const jwksRsa = require("jwks-rsa");
  assert.strictEqual(typeof jwksRsa, "function");
  return "jwks-rsa loaded";
});

check("jose resolves to a CommonJS build under jwks-rsa", () => {
  const resolved = jwksRsaRequire.resolve("jose").replace(/\\/g, "/");
  assert.match(resolved, /jose\/dist\/node\/cjs\//, `resolved to ${resolved}`);
  return resolved.split("node_modules/").pop();
});

check("require('nodemailer')  [/api/contact, /api/welcome]", () => {
  const nodemailer = require("nodemailer");
  assert.strictEqual(typeof nodemailer.createTransport, "function");
  return "createTransport is exported";
});

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed ? 1 : 0;
