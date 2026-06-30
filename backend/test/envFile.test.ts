import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvText, updateEnvFile } from "../src/settings/envFile.js";

test("env parser handles comments, quotes and inline comments", () => {
  const parsed = parseEnvText([
    "# comment",
    "A=plain",
    "B=\"hello world\"",
    "C='secret # hash'",
    "D=value # comment",
  ].join("\n"));

  assert.deepEqual(parsed, {
    A: "plain",
    B: "hello world",
    C: "secret # hash",
    D: "value",
  });
});

test("env writer preserves comments and only updates allowlisted keys", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mc-env-"));
  const file = path.join(dir, ".env");
  try {
    await writeFile(file, "# top\nA=old\nB=keep\n", "utf-8");
    await updateEnvFile(file, { A: "new value", C: "created" }, new Set(["A", "C"]));

    assert.equal(await readFile(file, "utf-8"), '# top\nA="new value"\nB=keep\n\nC=created\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("env writer rejects non-allowlisted keys", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mc-env-"));
  const file = path.join(dir, ".env");
  try {
    await assert.rejects(
      () => updateEnvFile(file, { DATABASE_URL: "file:bad.db" }, new Set(["TMDB_API_KEY"])),
      /not editable/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("env writer creates new files without leading blank lines", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mc-env-"));
  const file = path.join(dir, ".env");
  try {
    await updateEnvFile(file, { TMDB_API_KEY: "secret" }, new Set(["TMDB_API_KEY"]));

    assert.equal(await readFile(file, "utf-8"), "TMDB_API_KEY=secret\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
