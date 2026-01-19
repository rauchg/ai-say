#!/usr/bin/env node

import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Speaker from "@mastra/node-speaker";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8"));

const help = `
ai-say v${pkg.version}

Text-to-speech CLI powered by Cartesia AI

Usage:
  ai-say [options] <text>
  echo "text" | ai-say

Options:
  -m, --model <model>  TTS model (default: sonic-turbo-2025-03-07)
  -h, --help           Show this help
  -v, --version        Show version
`.trim();

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help")) {
  console.log(help);
  process.exit(0);
}

if (args.includes("-v") || args.includes("--version")) {
  console.log(pkg.version);
  process.exit(0);
}

let model = "sonic-turbo-2025-03-07";
const textParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "-m" || args[i] === "--model") {
    model = args[++i];
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

const apiKey = process.env.CARTESIA_API_KEY;
if (!apiKey) {
  console.error("CARTESIA_API_KEY environment variable is required");
  process.exit(1);
}

const VOICE_ID = "694f9389-aac1-45b6-b726-9d9369183238";
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
    voice: { mode: "id", id: VOICE_ID },
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
