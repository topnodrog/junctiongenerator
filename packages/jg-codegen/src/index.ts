import { createHash } from "node:crypto";

export type ContractKind = "erc20" | "multisig" | "erc721" | "dao";

export interface ContractSecuritySpec {
  reentrancyGuard?: boolean;
  ownerPrivilege?: boolean;
}

export interface ContractSpec {
  kind: ContractKind;
  /** Solidity identifier; free-form prompts are deliberately not accepted. */
  name: string;
  symbol?: string;
  initialSupply?: string;
  taxBps?: number;
  owners?: string[];
  requiredSignatures?: number;
  security?: ContractSecuritySpec;
}

export interface NormalizedSecuritySpec {
  reentrancyGuard: boolean;
  ownerPrivilege: false;
}

export interface NormalizedErc20Spec {
  kind: "erc20";
  name: string;
  symbol: string;
  initialSupply: string;
  taxBps: number;
  security: NormalizedSecuritySpec;
}

export interface NormalizedMultisigSpec {
  kind: "multisig";
  name: string;
  owners: string[];
  requiredSignatures: number;
  security: NormalizedSecuritySpec;
}

export type NormalizedContractSpec = NormalizedErc20Spec | NormalizedMultisigSpec;

export type FindingSeverity = "error" | "warning";

export interface StaticFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
  line: number;
}

export interface ArtifactManifest {
  schemaVersion: "jg-codegen-manifest/v1";
  generatorVersion: string;
  sourceSha256: string;
  specSha256: string;
  compiler: {
    status: "not-run";
    requiredSolc: "0.8.24";
    reason: string;
  };
  deployment: {
    allowed: false;
    reason: string;
  };
}

export interface GeneratedArtifact {
  schemaVersion: "jg-codegen-artifact/v1";
  generatorVersion: string;
  normalizedSpec: NormalizedContractSpec;
  source: string;
  sourceSha256: string;
  specSha256: string;
  findings: StaticFinding[];
  manifest: ArtifactManifest;
}

const GENERATOR_VERSION = "0.1.0";
const SOLC_VERSION = "0.8.24";
const UINT256_MAX = (1n << 256n) - 1n;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SYMBOL = /^[A-Za-z0-9]{1,11}$/;
const UINT_DECIMAL = /^(0|[1-9][0-9]*)$/;
const ADDRESS = /^0x[0-9a-f]{40}$/i;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Stable JSON used for artifact identity; object key order never affects hashes. */
export function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON does not allow non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

function requireIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value) || /^(?:contract|function|constructor|mapping|address|uint256|bytes|string|bool)$/.test(value)) {
    throw new Error(`${label} must be a non-reserved Solidity identifier (1..64 ASCII characters)`);
  }
  return value;
}

function requireUint(value: string | undefined, label: string, defaultValue?: string): string {
  const candidate = value ?? defaultValue;
  if (candidate === undefined || !UINT_DECIMAL.test(candidate)) throw new Error(`${label} must be a canonical decimal integer`);
  const parsed = BigInt(candidate);
  if (parsed > UINT256_MAX) throw new Error(`${label} must fit uint256`);
  return candidate;
}

function requireBoundedInteger(value: number | undefined, label: string, minimum: number, maximum: number, defaultValue: number): number {
  const candidate = value ?? defaultValue;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer in [${minimum}, ${maximum}]`);
  }
  return candidate;
}

function normalizeSecurity(input: ContractSecuritySpec | undefined): NormalizedContractSpec["security"] {
  if (input?.ownerPrivilege === true) {
    throw new Error("owner privilege is not supported by the bounded generator");
  }
  return {
    reentrancyGuard: input?.reentrancyGuard ?? true,
    ownerPrivilege: false,
  };
}

/** Validate and normalize the only templates currently permitted by the release pipeline. */
export function normalizeContractSpec(input: ContractSpec): NormalizedContractSpec {
  const name = requireIdentifier(input.name, "contract name");
  const security = normalizeSecurity(input.security);
  if (input.kind === "erc20") {
    const symbol = input.symbol ?? "JGC";
    if (!SYMBOL.test(symbol)) throw new Error("ERC-20 symbol must be 1..11 ASCII letters or digits");
    const initialSupply = requireUint(input.initialSupply, "initial supply", "1000000");
    const taxBps = requireBoundedInteger(input.taxBps, "taxBps", 0, 1000, 0);
    return { kind: "erc20", name, symbol: symbol.toUpperCase(), initialSupply, taxBps, security };
  }
  if (input.kind === "multisig") {
    if (!input.owners || input.owners.length === 0 || input.owners.length > 32) {
      throw new Error("multisig owners must contain 1..32 addresses");
    }
    const owners = input.owners.map((owner) => {
      if (!ADDRESS.test(owner)) throw new Error(`invalid owner address: ${owner}`);
      return owner.toLowerCase();
    }).sort();
    if (new Set(owners).size !== owners.length) throw new Error("multisig owners must be unique");
    const requiredSignatures = requireBoundedInteger(input.requiredSignatures, "requiredSignatures", 1, owners.length, 1);
    return { kind: "multisig", name, owners, requiredSignatures, security };
  }
  throw new Error(`template ${input.kind} is intentionally unavailable until it has a reviewed implementation`);
}

function solidityString(value: string): string {
  return JSON.stringify(value);
}

function generateErc20(spec: Extract<NormalizedContractSpec, { kind: "erc20" }>): string {
  return [
    "// SPDX-License-Identifier: MIT",
    `// Generated by @jg/codegen ${GENERATOR_VERSION}; review and compile before use.`,
    `pragma solidity ^${SOLC_VERSION};`,
    "",
    `contract ${spec.name} {`,
    `    string public constant name = ${solidityString(spec.name)};`,
    `    string public constant symbol = ${solidityString(spec.symbol!)};`,
    "    uint8 public constant decimals = 18;",
    `    uint256 public constant TRANSACTION_TAX_BPS = ${spec.taxBps};`,
    "    uint256 public totalSupply;",
    "    address public immutable treasury;",
    "    mapping(address => uint256) public balanceOf;",
    "    mapping(address => mapping(address => uint256)) public allowance;",
    "",
    "    event Transfer(address indexed from, address indexed to, uint256 value);",
    "    event Approval(address indexed owner, address indexed spender, uint256 value);",
    "",
    "    constructor(address treasury_) {",
    "        require(treasury_ != address(0), \"treasury is zero\");",
    "        treasury = treasury_;",
    `        _mint(msg.sender, ${spec.initialSupply} * 10 ** decimals);`,
    "    }",
    "",
    "    function transfer(address to, uint256 value) external returns (bool) {",
    "        _transfer(msg.sender, to, value);",
    "        return true;",
    "    }",
    "",
    "    function approve(address spender, uint256 value) external returns (bool) {",
    "        allowance[msg.sender][spender] = value;",
    "        emit Approval(msg.sender, spender, value);",
    "        return true;",
    "    }",
    "",
    "    function transferFrom(address from, address to, uint256 value) external returns (bool) {",
    "        uint256 permitted = allowance[from][msg.sender];",
    "        require(permitted >= value, \"allowance exceeded\");",
    "        allowance[from][msg.sender] = permitted - value;",
    "        emit Approval(from, msg.sender, permitted - value);",
    "        _transfer(from, to, value);",
    "        return true;",
    "    }",
    "",
    "    function _transfer(address from, address to, uint256 value) internal {",
    "        require(to != address(0), \"recipient is zero\");",
    "        require(balanceOf[from] >= value, \"balance exceeded\");",
    "        balanceOf[from] -= value;",
    `        uint256 tax = value * TRANSACTION_TAX_BPS / 10000;`,
    "        balanceOf[to] += value - tax;",
    "        emit Transfer(from, to, value - tax);",
    "        if (tax != 0) {",
    "            balanceOf[treasury] += tax;",
    "            emit Transfer(from, treasury, tax);",
    "        }",
    "    }",
    "",
    "    function _mint(address to, uint256 value) internal {",
    "        totalSupply += value;",
    "        balanceOf[to] += value;",
    "        emit Transfer(address(0), to, value);",
    "    }",
    "}",
    "",
  ].join("\n");
}

function generateMultisig(spec: Extract<NormalizedContractSpec, { kind: "multisig" }>): string {
  const ownerConstants = spec.owners!.map((owner, index) => `    address public constant OWNER_${index} = ${owner};`);
  const ownerAdds = spec.owners!.map((_, index) => `        _addOwner(OWNER_${index});`);
  return [
    "// SPDX-License-Identifier: MIT",
    `// Generated by @jg/codegen ${GENERATOR_VERSION}; review and compile before use.`,
    `pragma solidity ^${SOLC_VERSION};`,
    "",
    `contract ${spec.name} {`,
    ...ownerConstants,
    `    uint256 public constant REQUIRED_SIGNATURES = ${spec.requiredSignatures};`,
    "    address[] public owners;",
    "    mapping(address => bool) public isOwner;",
    "",
    "    struct Transaction { address destination; uint256 value; bytes data; bool executed; }",
    "    Transaction[] public transactions;",
    "    mapping(uint256 => mapping(address => bool)) public confirmations;",
    "",
    "    event Submission(uint256 indexed transactionId);",
    "    event Confirmation(address indexed owner, uint256 indexed transactionId);",
    "    event Execution(uint256 indexed transactionId);",
    "",
    "    constructor() payable {",
    ...ownerAdds,
    "    }",
    "",
    "    function submitTransaction(address destination, uint256 value, bytes calldata data) external onlyOwner returns (uint256 transactionId) {",
    "        transactions.push(Transaction(destination, value, data, false));",
    "        transactionId = transactions.length - 1;",
    "        emit Submission(transactionId);",
    "    }",
    "",
    "    function confirmTransaction(uint256 transactionId) external onlyOwner {",
    "        require(transactionId < transactions.length, \"unknown transaction\");",
    "        confirmations[transactionId][msg.sender] = true;",
    "        emit Confirmation(msg.sender, transactionId);",
    "    }",
    "",
    "    function executeTransaction(uint256 transactionId) external onlyOwner {",
    "        Transaction storage transaction = transactions[transactionId];",
    "        require(!transaction.executed, \"already executed\");",
    "        uint256 count;",
    "        for (uint256 index = 0; index < owners.length; index++) {",
    "            if (confirmations[transactionId][owners[index]]) count++;",
    "        }",
    "        require(count >= REQUIRED_SIGNATURES, \"insufficient confirmations\");",
    "        transaction.executed = true;",
    "        (bool success, ) = transaction.destination.call{value: transaction.value}(transaction.data);",
    "        require(success, \"transaction failed\");",
    "        emit Execution(transactionId);",
    "    }",
    "",
    "    function _addOwner(address owner) internal {",
    "        require(owner != address(0) && !isOwner[owner], \"invalid owner\");",
    "        isOwner[owner] = true;",
    "        owners.push(owner);",
    "    }",
    "",
    "    modifier onlyOwner() {",
    "        require(isOwner[msg.sender], \"not owner\");",
    "        _;",
    "    }",
    "",
    "    receive() external payable {}",
    "}",
    "",
  ].join("\n");
}

export function generateSolidity(input: ContractSpec | NormalizedContractSpec): { spec: NormalizedContractSpec; source: string } {
  const spec = normalizeContractSpec(input as ContractSpec);
  const source = spec.kind === "erc20" ? generateErc20(spec) : generateMultisig(spec);
  return { spec, source };
}

/** Lightweight deterministic checks; a real compiler and independent audit remain release gates. */
export function analyzeSolidity(source: string): StaticFinding[] {
  const rules: Array<{ code: string; severity: FindingSeverity; pattern: RegExp; message: string }> = [
    { code: "SOL-001", severity: "error", pattern: /tx\.origin\b/g, message: "tx.origin authorization is forbidden" },
    { code: "SOL-002", severity: "error", pattern: /\bdelegatecall\b/g, message: "delegatecall requires an explicit reviewed exception" },
    { code: "SOL-003", severity: "error", pattern: /\bselfdestruct\b/g, message: "selfdestruct is forbidden in generated artifacts" },
    { code: "SOL-004", severity: "warning", pattern: /\.call\s*\{/g, message: "external value call requires reentrancy and failure-path review" },
    { code: "SOL-005", severity: "warning", pattern: /\bunchecked\s*\{/g, message: "unchecked arithmetic requires a boundedness proof" },
  ];
  const findings: StaticFinding[] = [];
  const lines = source.split("\n");
  for (const rule of rules) {
    for (let index = 0; index < lines.length; index++) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(lines[index]!)) findings.push({ code: rule.code, severity: rule.severity, message: rule.message, line: index + 1 });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
}

/** Produce a content-addressed artifact. This function never invokes solc or a deployer. */
export function generateContractArtifact(input: ContractSpec): GeneratedArtifact {
  const { spec, source } = generateSolidity(input);
  const sourceSha256 = sha256(source);
  const specSha256 = sha256(stableStringify(spec));
  const findings = analyzeSolidity(source);
  return {
    schemaVersion: "jg-codegen-artifact/v1",
    generatorVersion: GENERATOR_VERSION,
    normalizedSpec: spec,
    source,
    sourceSha256,
    specSha256,
    findings,
    manifest: {
      schemaVersion: "jg-codegen-manifest/v1",
      generatorVersion: GENERATOR_VERSION,
      sourceSha256,
      specSha256,
      compiler: {
        status: "not-run",
        requiredSolc: SOLC_VERSION,
        reason: "Compilation must run in the pinned release environment with its dependency lock.",
      },
      deployment: {
        allowed: false,
        reason: "Generated artifacts require compiler output, tests, static analysis, and human approval.",
      },
    },
  };
}
