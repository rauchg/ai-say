# ai-say

Text-to-speech CLI powered by [Cartesia AI](https://cartesia.ai) with real-time streaming.

## Install

```bash
npm i -g ai-say-cli
```

<details>
<summary>pnpm users</summary>

pnpm blocks native module builds by default. After installing, run:

```bash
cd $(pnpm root -g)/.pnpm/@mastra+node-speaker@0.1.0/node_modules/@mastra/node-speaker
npx node-gyp rebuild
```

</details>

## Setup

Get your API key from https://play.cartesia.ai/keys

```bash
export CARTESIA_API_KEY="your-key"
```

## Usage

```bash
ai-say "Hello world"
echo "Piped text" | ai-say
ai-say -m sonic-3 "Use a different model"
```
