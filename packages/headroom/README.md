# headroom

Instrumented Anthropic client for JunctionGenerator. Wraps the Anthropic SDK
with [`headroom-ai`](https://www.npmjs.com/package/headroom-ai) so Claude API
calls are measured — the compute-accounting layer the project is built around.

Folded in from the former standalone `~/projects/headroom` wrapper (Kali side).

## Usage

```js
const { client } = require('@junction-generator/headroom');
// `client` is a headroom-wrapped Anthropic client; use it like the normal SDK.
```

## Setup

```bash
cp .env.example .env      # then put a freshly-rotated ANTHROPIC_API_KEY in .env
npm install
```

`.env` is gitignored. Never commit your key.
