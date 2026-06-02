# Junction Generator

**Turn Your Vibe Into Verifiable Web3 Code**

Junction Generator is the world's first AI-operated, mined-compute Web3 factory. Speak in plain English to compile smart contracts, and secure the network using Proof-of-Useful-Compute.

**Live site:** [junctiongenerator.net](https://junctiongenerator.net)

## What It Is

Junction Generator proposes **Proof-of-Useful-Compute (PoUC)** — a protocol that replaces cryptocurrency mining's wasteful hash puzzles with verifiable AI workload completion. GPU miners earn $JGC tokens by running real inference, training, and fine-tuning tasks instead of burning electricity on meaningless computations.

## Tech Stack

- **Framework:** Next.js 16 + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4 + custom CSS design system
- **Deployment:** Vercel
- **Fonts:** Outfit + JetBrains Mono (via next/font)

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main landing page
│   ├── layout.tsx        # Root layout with metadata
│   ├── globals.css       # Design system (colors, glassmorphism, animations)
│   └── whitepaper/
│       └── page.tsx      # Concept paper page
└── components/
    ├── VibePlayground.tsx    # Interactive smart contract compiler
    ├── MiningTelemetry.tsx   # PoUC compute grid dashboard + canvas visualizer
    ├── AgentConsole.tsx      # Multi-agent C-Suite console
    └── OSCRPCalculator.tsx   # Contributor reward simulator + leaderboard
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Concept & Design | ✅ Complete | Core concept validated |
| 2. Frontend & Demo | 🔄 In Progress | Interactive demo site |
| 3. Protocol Spec | ⬜ Planned | Formal PoUC specification |
| 4. Mining Client MVP | ⬜ Planned | GPU mining client |
| 5. AI Marketplace | ⬜ Planned | Compute marketplace |
| 6. Mainnet Launch | ⬜ Planned | $JGC token launch |

## Contributing

Junction Generator is open source. Every contribution earns OSCRP rewards (Autonomy Equity in the protocol treasury). See the [Whitepaper](/whitepaper) for details.

## License

Open Source under OSCRP — see [concept-paper.md](docs/concept-paper.md) for the full protocol specification.
