import { setPQVerifierMode } from "../crypto/pq-zkp.js";

// Simulation fixtures intentionally exercise the research receipt transport.
// Production and unconfigured processes remain strict/fail-closed by default.
setPQVerifierMode("simnet");
