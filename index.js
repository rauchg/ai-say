#!/usr/bin/env node

import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Speaker from "@mastra/node-speaker";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const DEFAULT_VOICE = "694f9389-aac1-45b6-b726-9d9369183238";

const help = `
ai-say v${pkg.version}

Text-to-speech CLI powered by Cartesia AI

Usage:
  ai-say [options] <text>
  echo "text" | ai-say

Options:
  -m, --model <model>  TTS model (default: sonic-3)
  -v, --voice <voice>  Voice ID or name (default: Barbershop Man)
  --list-voices        List available voices
  -h, --help           Show this help
  --version            Show version
`.trim();

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  console.log(help);
  process.exit(0);
}

if (args.includes("--version")) {
  console.log(pkg.version);
  process.exit(0);
}

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  console.error("CARTESIA_API_KEY environment variable is required");
  process.exit(1);
}

async function listVoices() {
  const voices = [];
  let startingAfter = null;

  while (true) {
    const url = new URL("https://api.cartesia.ai/voices");
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2025-04-16",
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch voices:", res.statusText);
      process.exit(1);
    }

    const data = await res.json();
    voices.push(...data.data);

    if (!data.has_more) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  voices
    .filter(v => v.is_public)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(v => console.log(`${v.id}  ${v.name}`));
}

async function resolveVoice(voice) {
  // If it looks like a UUID, use it directly
  if (/^[0-9a-f-]{36}$/i.test(voice)) {
    return voice;
  }

  // Fetch all voices
  const voices = [];
  let startingAfter = null;

  while (true) {
    const url = new URL("https://api.cartesia.ai/voices");
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2025-04-16",
      },
    });

    if (!res.ok) {
      console.error("Failed to fetch voices:", res.statusText);
      process.exit(1);
    }

    const data = await res.json();
    voices.push(...data.data);

    if (!data.has_more) break;
    startingAfter = data.data[data.data.length - 1].id;
  }

  const voiceLower = voice.toLowerCase();

  // 1. Exact ID match
  const exactId = voices.find(v => v.id === voice);
  if (exactId) return exactId.id;

  // 2. Exact name match
  const exactName = voices.find(v => v.name.toLowerCase() === voiceLower);
  if (exactName) return exactName.id;

  // 3. Partial name match
  const partial = voices.find(v => v.name.toLowerCase().includes(voiceLower));
  if (partial) return partial.id;

  console.error(`Voice not found: ${voice}`);
  console.error("Use --list-voices to see available voices");
  process.exit(1);
}

if (args.includes("--list-voices")) {
  await listVoices();
  process.exit(0);
}

let model = "sonic-3";
let voice = DEFAULT_VOICE;
const textParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-m" || args[i] === "--model") {
    model = args[++i];
  } else if (args[i] === "-v" || args[i] === "--voice") {
    voice = args[++i];
  } else {
    textParts.push(args[i]);
  }
}

let text = textParts.join(" ");

// Read from stdin if no text provided and stdin is piped
if (!text && !process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  text = Buffer.concat(chunks).toString().trim();
}

if (!text) {
  console.log(help);
  process.exit(1);
}

// Resolve voice name to ID if needed
const voiceId = await resolveVoice(voice);

const SAMPLE_RATE = 44100;

const speaker = new Speaker({
  channels: 1,
  bitDepth: 16,
  sampleRate: SAMPLE_RATE,
  signed: true,
});

const ws = new WebSocket(
  `wss://api.cartesia.ai/tts/websocket?api_key=${apiKey}&cartesia_version=2025-04-16`
);

ws.on("open", () => {
  ws.send(JSON.stringify({
    model_id: model,
    transcript: text,
    voice: { mode: "id", id: voiceId },
    language: "en",
    context_id: randomUUID(),
    output_format: {
      container: "raw",
      encoding: "pcm_s16le",
      sample_rate: SAMPLE_RATE,
    },
  }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "error" || msg.error) {
    console.error("Error:", msg.error || msg.message || "Unknown error");
    process.exit(1);
  }

  if (msg.type === "chunk" && msg.data) {
    const audio = Buffer.from(msg.data, "base64");
    speaker.write(audio);
  }

  if (msg.done) {
    speaker.end();
    ws.close();
  }
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
  process.exit(1);
});

speaker.on("close", () => {
  process.exit(0);
});
