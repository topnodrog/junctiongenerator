const fs = require("node:fs");
const path = require("node:path");
const solc = require("../../tools/jgt-rescue/node_modules/solc");

const repositoryRoot = path.resolve(__dirname, "../..");
const sourcePath = path.join(repositoryRoot, "contracts", "JGTClaimDispenser.sol");
const source = fs.readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "JGTClaimDispenser.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const diagnostics = output.errors ?? [];
for (const diagnostic of diagnostics) {
  const writer = diagnostic.severity === "error" ? console.error : console.warn;
  writer(diagnostic.formattedMessage);
}

if (diagnostics.some(({ severity }) => severity === "error")) process.exit(1);
const compiled = output.contracts?.["JGTClaimDispenser.sol"]?.JGTClaimDispenser;
if (!compiled?.evm?.bytecode?.object || !compiled.evm.deployedBytecode.object) {
  console.error("JGTClaimDispenser compiled without deployment bytecode.");
  process.exit(1);
}

console.log(`JGTClaimDispenser compiled with solc ${solc.version()}.`);
console.log(`Creation bytecode: ${compiled.evm.bytecode.object.length / 2} bytes.`);
console.log(`Runtime bytecode template: ${compiled.evm.deployedBytecode.object.length / 2} bytes.`);
