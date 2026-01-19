# ai-say

Text-to-speech CLI powered by [Cartesia AI](https://cartesia.ai) with real-time streaming.

## Install

```bash
npm i -g ai-say-cli
```

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
