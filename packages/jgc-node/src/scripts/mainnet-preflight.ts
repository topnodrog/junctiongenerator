import {
  evaluateMainnetReadiness,
  MAINNET_READINESS,
} from "../config/mainnet-readiness.js";

const result = evaluateMainnetReadiness(MAINNET_READINESS);
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
