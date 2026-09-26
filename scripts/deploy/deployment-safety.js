'use strict';

// Public original-deployer address documented in README.md; never store or derive
// its private key in this helper.
const COMPROMISED_JGT_DEPLOYER = '0x5f89d06e0d4dbe3c125a49fd9213624ad8a991d4';

function assertNotCompromisedDeployer(address, action = 'deployment') {
  if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`Refusing ${action}: invalid sender address.`);
  }
  if (address.toLowerCase() === COMPROMISED_JGT_DEPLOYER) {
    throw new Error(`Refusing ${action}: the original JGT deployer is compromised and must never be used.`);
  }
}

module.exports = { assertNotCompromisedDeployer, COMPROMISED_JGT_DEPLOYER };
