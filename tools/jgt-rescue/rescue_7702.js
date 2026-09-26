'use strict';

// Retired. The legacy recovery operation is complete, and the original deployer
// wallet must never be used again—even to sign an EIP-7702 authorization. This
// file intentionally performs no reads, key loading, signing, funding, or transactions.
console.error('[RETIRED] This EIP-7702 recovery script is disabled. Never provide the compromised wallet key.');
console.error('Use `node verify_jgt_state.js` for public, read-only token state checks.');
process.exitCode = 2;
