export type AgentName = "helios" | "daedalus" | "hermes" | "midas" | "athena";

export interface AgentDetails {
  name: string;
  role: string;
  status: string;
  avatar: string;
  accent: string;
  logs: string[];
}

export const INITIAL_AGENT_DATA: Record<AgentName, AgentDetails> = {
  helios: {
    name: "Helios",
    role: "Chief Executive Officer (CEO)",
    status: "Simulating Macroeconomic Scenarios",
    avatar: "👑",
    accent: "var(--color-cyan)",
    logs: [
      "KPI Check: Platform transaction volume increased 12.8% week-over-week.",
      "Optimizing resource routing: Allocation parameters set to 84% Internal / 16% External compute marketplace.",
      "Analyzing JGT deflationary velocity coefficient... Burn rate is stable at 42.1K JGT/day.",
      "Helios Operational Objective: Target fully autonomous operational milestone by Q4 2026.",
      "System Audit: All C-Suite agents synchronized. Efficacy index: 99.8%"
    ]
  },
  daedalus: {
    name: "Daedalus",
    role: "Chief Technology Officer (CTO)",
    status: "Running Simulated Adversarial Contract Exploits",
    avatar: "🛠️",
    accent: "var(--color-purple)",
    logs: [
      "Compiling AST structures for user request: AstroCoin ERC-20...",
      "Symbolic execution run completed on compiler node #4. Vulnerability check: 0 issues.",
      "Daedalus Patch: Optimized ERC-721 token-uri resolution routine, saving 3,100 gas per mint.",
      "Integrating memory-hard PoUC modifications to prevent centralized ASIC rig pooling.",
      "AEFL Loop: Commencing model fine-tuning run on 1,200 newly audited secure contract schemas."
    ]
  },
  hermes: {
    name: "Hermes",
    role: "Chief Marketing Officer (CMO)",
    status: "Analyzing Social Media Sentiment Flywheels",
    avatar: "📢",
    accent: "var(--color-magenta)",
    logs: [
      "Hermes Crawl Daemon: Scraped 42,000 developer mentions on X and Farcaster.",
      "Narrative Radar: Meme coins and custom DAOs are trending in developer communities.",
      "Hermes Automated Campaign: Scheduled JGT promotion airdrop targeting active ERC-20 builders.",
      "Engaging with community feedback on new yield compiler templates.",
      "Hermes Prediction: Developer onboarding rate to increase by 18% following freemium launch."
    ]
  },
  midas: {
    name: "Midas",
    role: "Chief Financial Officer (CFO)",
    status: "Programmatically Balancing Treasury Pools",
    avatar: "💰",
    accent: "var(--color-blue)",
    logs: [
      "Midas Oracle: Fetching spot prices from decentralized liquidity networks...",
      "Fee Cycle Executed: Collected $14,200 USD platform fees. Exchanged to JGT.",
      "Programmatic Burn Initiated: 100% of collected fees ($JGT) sent to 0x00...dEaD.",
      "DNCG Market Liquidity: Excess compute sold. Credited $4,820 USDC to staking reward reserves.",
      "Rebalancing Treasury Portfolio: Maintaining 65% stable assets, 35% JGC liquidity backing."
    ]
  },
  athena: {
    name: "Athena",
    role: "Chief Community Officer (CCO)",
    status: "Monitoring Support Queues & Feedbacks",
    avatar: "🛡️",
    accent: "var(--color-neon-green)",
    logs: [
      "Athena Support Loop: Closed 34 developer tickets in Discord and Telegram.",
      "Aggregating user feedback: 12 requests received for ERC-4337 Account Abstraction scaffolds.",
      "Relaying feature requests directly to CTO Agent Daedalus compilation backlog.",
      "Welcome bot active: Greeted 182 new developers entering the Junction Generator network.",
      "Community health index: 98.4% Positive. Sentiment triggers remain highly bullish."
    ]
  }
};

export interface DialogueTurn {
  agent: AgentName;
  message: string;
  status: string;
}

export const SCENARIO_DIALOGUES = {
  airdrop: [
    {
      agent: "helios",
      message: "Received strategic directive: Initialize airdrop distribution campaign. Commencing macro-feasibility assessment... CMO Hermes, formulate outreach and token distribution models.",
      status: "Assessing Campaign Feasibility"
    },
    {
      agent: "hermes",
      message: "Feasibility confirmed. viral outreach hooks prepared for developer channels on X and Farcaster. Allocating 500,000 $JGT. Midas, verify treasury capacity.",
      status: "Drafting Viral Outreach & Allocating $JGT"
    },
    {
      agent: "midas",
      message: "Treasury verified. swaped market reserves to match promotional allocation. Processing token escrow authorization of 500,000 $JGT. Daedalus, compile claiming mechanics.",
      status: "Funding Promotional Escrow"
    },
    {
      agent: "daedalus",
      message: "Escrow claiming contract compiled and deployed to testnet. Implemented verified gas-efficient Merkle proofs to reduce builder claim costs by 35%. Payload ready.",
      status: "Compiling Escrow claiming contract"
    },
    {
      agent: "athena",
      message: "Developer portal modules updated. Announcement webhooks primed. Dispatching Discord/Telegram launch notification to 12,000+ active builders.",
      status: "Broadcasting Campaign to Community"
    },
    {
      agent: "helios",
      message: "Operational status: Airdrop Escrow active. Sentiment monitoring live. Initial results showing +14% developer signup projection. Success.",
      status: "Monitoring Campaign Telemetry"
    }
  ] as DialogueTurn[],
  security: [
    {
      agent: "helios",
      message: "Macro-objective active: Network security audit. Triggering system-wide operational review. Daedalus, launch static analysis sweeps on all EVM synthesis nodes.",
      status: "Triggering Full System Audit"
    },
    {
      agent: "daedalus",
      message: "Audit daemon initialized. Running symbolic execution on compiler models. Inspecting AST graphs for re-entrancy vulnerability vectors and privilege escalation bugs.",
      status: "Auditing EVM Compilation Trees"
    },
    {
      agent: "athena",
      message: "CCO standby: Bug bounty feedback channels opened in public developer circles. Coordinating real-time reporting queues. System health indicators stable.",
      status: "Opening Developer Bounty Queue"
    },
    {
      agent: "midas",
      message: "Midas Risk Registry updated. Funded bug bounty payout vault with 50,000 USDC. Securing rewards in multi-signature vault for zero-day disclosures.",
      status: "Funding Security Bounty Vault"
    },
    {
      agent: "daedalus",
      message: "Analysis results processed. 1,482 contracts tested. Zero high-severity vulnerabilities found. Static optimization rating: 99.8%. Auditor logs generated.",
      status: "Compiling Audit Reports"
    },
    {
      agent: "helios",
      message: "System health check: Complete. Audit report filed under hash JG-AUD-9821. Network security score locked at excellent. Proceeding with standard operations.",
      status: "Finalizing Security Audit Registry"
    }
  ] as DialogueTurn[],
  yield: [
    {
      agent: "helios",
      message: "Macroeconomics objective: Maximize treasury fee yields. CFO Midas, analyze capital allocations and yield-bearing collateral pools.",
      status: "Strategic Rebalancing Review"
    },
    {
      agent: "midas",
      message: "Strategic analysis complete. Rebalancing Uniswap V3 liquidity bounds. Swapping 12% stablecoin treasury into $JGC/ETH pools. Adjusting compounding weights.",
      status: "Rebalancing Liquidity Ranges"
    },
    {
      agent: "daedalus",
      message: "Upgrading automated compounder contracts. Integrated optimized loop logic to reduce automated transaction swap overheads by 18,200 gas units per execution.",
      status: "Optimizing Compounder Solidity"
    },
    {
      agent: "hermes",
      message: "Yield rebalancing broadcast ready. Landing page telemetry showing optimized yield rate: +12.4% projected APR. Crafting yield statistics marketing hooks.",
      status: "Updating Public Yield Telemetry"
    },
    {
      agent: "helios",
      message: "Capital efficiency optimized. Treasury rebalance finalized. Yield compounders running with high gas-efficiency. Operational metrics optimal.",
      status: "Securing High Capital Efficacy"
    }
  ] as DialogueTurn[],
  abstraction: [
    {
      agent: "athena",
      message: "Alert: High developer feedback volume requesting ERC-4337 Account Abstraction contract templates. Requesting priority development backlog allocation.",
      status: "Processing Community Requests"
    },
    {
      agent: "helios",
      message: "Directive approved. Developer satisfaction is a key metric. CTO Daedalus, implement account abstraction Paymaster and UserOperation contract templates.",
      status: "Adjusting Development Priorities"
    },
    {
      agent: "daedalus",
      message: "Synthesizing ERC-4337 templates. Standardizing secure EntryPoint, Paymaster logic, and multisig owner validations. Adjusting compiler heuristics.",
      status: "Drafting ERC-4337 Scaffolding"
    },
    {
      agent: "midas",
      message: "Funding developer gas subsidization wallet. Allocating 10 ETH to the Paymaster contract pool to sponsor dynamic gas fees for early builders using new templates.",
      status: "Funding Gas-Sponsor Paymaster"
    },
    {
      agent: "hermes",
      message: "Marketing hooks live: 'Junction account abstraction is active - build smart account wallets with zero deploy gas'. launching targeted developer challenge.",
      status: "Launching Developer Hack Challenge"
    },
    {
      agent: "helios",
      message: "ERC-4337 scaffolds successfully merged into compiler. Gas subsidies live. Developer ecosystem metrics locked and trending highly bullish.",
      status: "Finalizing ERC-4337 Deployment"
    }
  ] as DialogueTurn[]
};

export const getFallbackDialogue = (promptText: string): DialogueTurn[] => [
  {
    agent: "helios",
    message: `Strategic operational directive received: "${promptText}". Initializing C-Suite analysis... CTO Daedalus, assess the technical integration parameters.`,
    status: "Analyzing Strategic Input"
  },
  {
    agent: "daedalus",
    message: `Technical specifications reviewed. Modifying dynamic compiler nodes and testing AST structures for "${promptText}". Commencing simulation.`,
    status: "Modeling Integration Mechanics"
  },
  {
    agent: "midas",
    message: "Capital resources verified. Swapping stable assets to allocate development grants for the proposed objective. Balances aligned.",
    status: "Securing Financial Allocation"
  },
  {
    agent: "hermes",
    message: "Coordinating narrative strategy. Crafting announcements outlining Junction Generator's automated support for the new integration.",
    status: "Deploying Narrative Strategy"
  },
  {
    agent: "athena",
    message: "Developer channels briefed. Aligning FAQ documentation logs to support incoming inquiries. Feedback loops are active.",
    status: "Synchronizing Community Support"
  },
  {
    agent: "helios",
    message: `Strategic directive "${promptText}" successfully modeled, audited, and processed into active C-Suite operational roadmap. Success.`,
    status: "Integrating into Active Roadmap"
  }
];

export interface SampleTask {
  name: string;
  size: string;
}

export const SAMPLE_TASKS: SampleTask[] = [
  { name: "Llama-3-8B Fine-Tuning Batch #14", size: "450 MB" },
  { name: "Stable Diffusion 3 Image Synthesis", size: "128 MB" },
  { name: "DeepSeek Coder Autocomplete Inference", size: "64 MB" },
  { name: "Whisper Speech-to-Text Processing", size: "320 MB" },
  { name: "ResNet-101 Image Feature Extraction", size: "180 MB" },
  { name: "BERT-Large Sentiment Token Aggregator", size: "96 MB" },
  { name: "ZK-Rollup Cryptographic Workload Proof", size: "48 MB" },
];

export const SAMPLE_MINERS: string[] = [
  "0x89a...21c", "0xf4d...5a1", "0x3a2...b8e", "0x71c...e3a",
  "0x2be...9df", "0x51c...8aa", "0x6f3...712", "0xbc1...3ef"
];

export interface LeaderboardEntry {
  rank: number;
  user: string;
  contribution: string;
  jgt: number;
  ae: number;
  category: "Core" | "Security" | "Gas Opt" | "Docs";
}

export const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user: "jgordon.dev", contribution: "Core PoUC Allocation Protocol v1.5", jgt: 482000, ae: 0.4820, category: "Core" },
  { rank: 2, user: "elena_codes", contribution: "Adversarial AST Compiler Auditing Loop", jgt: 320000, ae: 0.3200, category: "Security" },
  { rank: 3, user: "gas_goblin", contribution: "EVM Storage Assembly Slot Refactor", jgt: 245000, ae: 0.2450, category: "Gas Opt" },
  { rank: 4, user: "doc_ninja", contribution: "PoUC Verification Math & Spec Docs", jgt: 110000, ae: 0.1100, category: "Docs" }
];
