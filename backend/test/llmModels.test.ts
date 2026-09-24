import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTags, fileKind, parseParams, parseQuant } from "../src/integrations/llmModels.js";

test("fileKind classifies mmproj/draft/model/other", () => {
  assert.equal(fileKind("mmproj-Qwen3.8-27B-Uncensored-F16.gguf"), "mmproj");
  assert.equal(fileKind("Qwen3.8-27B-Uncensored-draft-Q4_0.gguf"), "draft");
  assert.equal(fileKind("Qwen3.8-27B-Uncensored-Q4_K_M.gguf"), "model");
  assert.equal(fileKind("model.safetensors"), "model");
  assert.equal(fileKind("config.json"), "other");
});

test("parseQuant extracts common GGUF/MLX quant tokens", () => {
  assert.equal(parseQuant("Qwen3.8-27B-Uncensored-Q4_K_M.gguf"), "Q4_K_M");
  assert.equal(parseQuant("mmproj-Qwen3.8-27B-Uncensored-IQ4_XS.gguf"), "IQ4_XS");
  assert.equal(parseQuant("model-Q8_0.gguf"), "Q8_0");
  assert.equal(parseQuant("mmproj-Qwen3.8-27B-Uncensored-F16.gguf"), "F16");
  assert.equal(parseQuant("model-bf16.safetensors"), "BF16");
  assert.equal(parseQuant("model-4bit"), "4bit");
  assert.equal(parseQuant("model-8bit.safetensors"), "8bit");
  assert.equal(parseQuant("plain-name.gguf"), null);
});

test("parseParams extracts model size, including MoE active-params notation", () => {
  assert.equal(parseParams("Qwen3.8-27B-Uncensored-GGUF"), "27B");
  assert.equal(parseParams("Some-Model-35B-A3B-Instruct"), "35B-A3B");
  assert.equal(parseParams("Llama-3.1-8B-Instruct"), "8B");
  assert.equal(parseParams("Qwen3-0.6B-mlx"), "0.6B");
  assert.equal(parseParams("no-size-here"), null);
});

test("detectTags picks up keywords from id and file names, plus vision from mmproj", () => {
  const tags = detectTags(
    "JonathanColetti/Qwen3.8-27B-Uncensored-GGUF",
    ["Qwen3.8-27B-Uncensored-Q4_K_M.gguf", "mmproj-Qwen3.8-27B-Uncensored-F16.gguf"],
  );
  assert.deepEqual(tags, ["uncensored", "vision"]);

  const instructTags = detectTags("org/Some-Coder-Instruct-Model", ["model-Q4_K_M.gguf"]);
  assert.deepEqual(instructTags, ["instruct", "coder"]);

  const none = detectTags("org/plain-model", ["model.gguf"]);
  assert.deepEqual(none, []);
});
