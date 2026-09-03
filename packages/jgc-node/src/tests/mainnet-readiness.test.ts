import { describe, expect, test } from "@jest/globals";
import {
  assertMainnetLaunchAllowed,
  evaluateMainnetReadiness,
  MAINNET_GATE_KEYS,
  MAINNET_READINESS,
} from "../config/mainnet-readiness.js";
import { MAINNET_NETWORK } from "../config/networks.js";
import { JGCNode } from "../network/node.js";
import { createNetworkGenesis } from "../config/networks.js";

describe("mainnet readiness guard", () => {
  test("the checked-in baseline is blocked and identifies every incomplete gate", () => {
    const result = evaluateMainnetReadiness(MAINNET_READINESS);

    expect(result.ready).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.missingGates).toEqual([...MAINNET_GATE_KEYS]);
  });

  test("the default launch guard fails closed", () => {
    expect(() => assertMainnetLaunchAllowed()).toThrow(/mainnet launch is blocked/);
  });

  test("rejects a readiness record for another network", () => {
    expect(() => evaluateMainnetReadiness({
      ...MAINNET_READINESS,
      network: { ...MAINNET_NETWORK, proofMode: "simnet-receipts-v1" },
    })).toThrow(/does not match the compiled network identity/);
  });

  test("requires ready status even when every gate is true", () => {
    const gates = Object.fromEntries(MAINNET_GATE_KEYS.map((key) => [key, true]));
    const candidate = {
      ...MAINNET_READINESS,
      status: "candidate" as const,
      gates,
    };

    const result = evaluateMainnetReadiness(candidate);
    expect(result.ready).toBe(false);
    expect(result.missingGates).toEqual([]);
    expect(() => assertMainnetLaunchAllowed(candidate)).toThrow(/status is not ready/);
  });

  test("prevents a mainnet-configured node from bypassing the launch guard", () => {
    expect(() => new JGCNode({
      listenPort: 0,
      rpcPort: 0,
      networkMagic: MAINNET_NETWORK.networkMagic,
      maxPeers: 8,
      enableBroker: false,
      junctionGeneratorMode: false,
      chainId: MAINNET_NETWORK.chainId,
      consensusVersion: MAINNET_NETWORK.consensusVersion,
      proofMode: MAINNET_NETWORK.proofMode,
      requireNetworkIdentity: true,
    }, createNetworkGenesis(MAINNET_NETWORK))).toThrow(/mainnet launch is blocked/);
  });

  test("requires authenticated P2P mode on a ready mainnet configuration", () => {
    const gates = Object.fromEntries(MAINNET_GATE_KEYS.map((key) => [key, true]));
    const ready = { ...MAINNET_READINESS, status: "ready" as const, gates };
    expect(() => new JGCNode({
      listenPort: 0,
      rpcPort: 0,
      networkMagic: MAINNET_NETWORK.networkMagic,
      maxPeers: 8,
      enableBroker: false,
      junctionGeneratorMode: false,
      chainId: MAINNET_NETWORK.chainId,
      consensusVersion: MAINNET_NETWORK.consensusVersion,
      proofMode: MAINNET_NETWORK.proofMode,
      requireNetworkIdentity: true,
      requirePeerAuthentication: false,
      mainnetReadiness: ready,
    }, createNetworkGenesis(MAINNET_NETWORK))).toThrow(/authenticated P2P mode/);
  });
});
