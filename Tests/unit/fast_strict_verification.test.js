#!/usr/bin/env node
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const context = { console, URL, Map, Set, Object, Array, String, Number, Boolean, Math, Date, setTimeout, clearTimeout, Promise };
context.globalThis = context;
vm.createContext(context);
for (const rel of [
  "Extension/shared/config.js",
  "Extension/core/policy.js",
  "Extension/core/snapshot.js",
  "Extension/core/ai.js"
]) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), context, { filename: rel });

const builder = context.EbayAiRequestBuilderV711;
assert(builder, "request builder missing");

const questions = Array.from({ length: 19 }, (_, i) => i === 0 ? "Brand" : `Strict Field ${i + 1}`);
const fields = questions.map(name => ({ name, type: "single", options: ["A", "B"] }));
const images = [{ dataUrl: "data:image/jpeg;base64,AA==", photoId: "p1", forceHighDetail: true }];
const prompt = "Verify only the supplied strict fields from direct photo evidence.";
const base = {
  apiBaseUrl: "https://api.openai.com",
  apiModel: "gpt-5.6",
  maxOutputTokens: "8000"
};
const options = { stage: "recovery", questions, fields };

const balancedChat = builder.buildItemSpecificsChatBody({ ...base, apiPath: "/v1/chat/completions", tokenMode: "balanced" }, prompt, images, options);
const cheapChat = builder.buildItemSpecificsChatBody({ ...base, apiPath: "/v1/chat/completions", tokenMode: "cheap" }, prompt, images, options);
const qualityChat = builder.buildItemSpecificsChatBody({ ...base, apiPath: "/v1/chat/completions", tokenMode: "quality", maxOutputTokens: "10000" }, prompt, images, options);
const balancedResponses = builder.buildItemSpecificsResponsesBody({ ...base, apiPath: "/v1/responses", tokenMode: "balanced" }, prompt, images, options);
const qualityResponses = builder.buildItemSpecificsResponsesBody({ ...base, apiPath: "/v1/responses", tokenMode: "quality", maxOutputTokens: "10000" }, prompt, images, options);

assert.strictEqual(balancedChat.reasoning_effort, "low", "Balanced strict verification must use LOW reasoning");
assert.strictEqual(cheapChat.reasoning_effort, "low", "Cheap strict verification must not use more reasoning than Balanced");
assert.strictEqual(qualityChat.reasoning_effort, "high", "Quality strict verification must remain HIGH");
assert.strictEqual(balancedResponses.reasoning?.effort, "low", "Responses API Balanced recovery must use LOW reasoning");
assert.strictEqual(qualityResponses.reasoning?.effort, "high", "Responses API Quality recovery must remain HIGH");

const chatImage = balancedChat.messages[1].content.find(part => part.type === "image_url");
const responseImage = balancedResponses.input[0].content.find(part => part.type === "input_image");
assert.strictEqual(chatImage?.image_url?.detail, "high", "Balanced recovery image detail must remain HIGH");
assert.strictEqual(responseImage?.detail, "high", "Responses recovery image detail must remain HIGH");

// The strict request builder keeps adequate output headroom; V8.23.21 reduces how often this path runs, not its evidence contract.
assert.strictEqual(balancedResponses.max_output_tokens, 3380, "Balanced recovery output headroom must not be reduced in this latency-only patch");
assert.strictEqual(balancedChat.max_completion_tokens, 3380, "Chat recovery output headroom must match the existing 3,380-token budget");

const aiSource = fs.readFileSync(path.join(ROOT, "Extension/core/ai.js"), "utf8");
assert(aiSource.includes("const verificationLimit = 8;"), "normal-Fill strict repair field cap must be eight");
assert(aiSource.includes("const repairPhotoLimit = settings.tokenMode === \"quality\" ? 3 : 2;"), "Balanced/Cheap repair must be bounded to two HIGH-detail evidence photos");

console.log("PASS V8.23.21 Fast Strict Verification: Balanced/Cheap recovery LOW, Quality HIGH, HIGH-detail evidence and output headroom unchanged");
