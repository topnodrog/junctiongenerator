'use strict';

// headroom — instrumented Anthropic client for JunctionGenerator.
// Wraps the Anthropic SDK with headroom-ai so Claude API calls are measured
// (the compute-accounting layer the project is built around). Folded in from
// the former standalone ~/projects/headroom wrapper.
//
// Requires ANTHROPIC_API_KEY in the environment (see .env.example). The SDK
// reads it from process.env; keep it in packages/headroom/.env (gitignored).

const Anthropic = require('@anthropic-ai/sdk');
const { withHeadroom } = require('headroom-ai/anthropic');

// Anthropic SDK exports itself as a factory; .default is the class.
const client = withHeadroom(new Anthropic.default());

module.exports = { client };
