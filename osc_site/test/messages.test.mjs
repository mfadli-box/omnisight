import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function load(locale) {
  const path = new URL(`../messages/${locale}.json`, import.meta.url);
  return JSON.parse(await readFile(path, "utf8"));
}

test("en and id locale catalogs have matching keys", async () => {
  const [en, id] = await Promise.all([load("en"), load("id")]);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(id).sort());
  assert.deepEqual(Object.keys(en.landing).sort(), Object.keys(id.landing).sort());
});
