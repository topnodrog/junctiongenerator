"use client";

import { useCallback, useState } from "react";
import {
  BrowserProvider,
  Contract,
  ZeroAddress,
  formatUnits,
  getAddress,
  isAddress,
  isHexString,
  keccak256,
  type Signer,
} from "ethers";

const BASE_CHAIN_ID = BigInt(8453);
const ZERO = BigInt(0);
const BASE_CHAIN_ID_HEX = "0x2105";
const JGT_TOKEN_ADDRESS = "0x7Fe2E89075F570ABcCf5451A00Bf780787FEc587";
const COMPROMISED_DEPLOYER_ADDRESS = "0x5f89d06E0D4dBe3C125a49FD9213624aD8a991d4";

function assertSafeClaimAccount(address: string): void {
  if (address.toLowerCase() === COMPROMISED_DEPLOYER_ADDRESS.toLowerCase()) {
    throw new Error("The original JGT deployer wallet is compromised. This faucet refuses signatures and transactions from it; connect a clean wallet.");
  }
}
const FAUCET_ABI = [
  "function token() view returns (address)",
  "function accrued(address account) view returns (uint256)",
  "function claimable(address account) view returns (uint256)",
  "function remainingFaucetSupply() view returns (uint256)",
  "function lastClaimAt(address account) view returns (uint256)",
  "function nonces(address account) view returns (uint256)",
  "function claim() returns (uint256)",
  "function claimWithSig(address account,uint256 amount,uint256 deadline,address relayer,bytes signature) returns (uint256)",
];
const CLAIM_TYPES = {
  Claim: [
    { name: "account", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "relayer", type: "address" },
  ],
};

interface AdSlot {
  id: string;
  durationSeconds: number;
  videoSrc: string;
}

// Insert a same-origin 30–60 second MP4/WebM path here when an ad is ready.
// Ad playback remains informational only until a server-verified completion flow exists.
const AD_SLOTS: AdSlot[] = [
  { id: "ad-1", durationSeconds: 30, videoSrc: "" },
  { id: "ad-2", durationSeconds: 45, videoSrc: "" },
  { id: "ad-3", durationSeconds: 60, videoSrc: "" },
];

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

interface JGTClaimFaucetProps {
  dispenserAddress: string;
  dispenserCodeHash: string;
  expectedCleanOwner: string;
}

interface Snapshot {
  accrued: bigint;
  claimable: bigint;
  lastClaimAt: bigint;
  nonce: bigint;
  remainingFaucetSupply: bigint;
  minterAuthorized: boolean;
  ownerIsCompromised: boolean;
  ownerMatchesExpected: boolean;
}

interface GasQuote {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  executionFee: bigint;
}

interface SignedClaim {
  chainId: number;
  tokenAddress: string;
  dispenserAddress: string;
  account: string;
  amount: string;
  nonce: string;
  deadline: number;
  relayer: string;
  signature: string;
}

const EMPTY_SNAPSHOT: Snapshot = {
  accrued: ZERO,
  claimable: ZERO,
  lastClaimAt: ZERO,
  nonce: ZERO,
  remainingFaucetSupply: ZERO,
  minterAuthorized: false,
  ownerIsCompromised: false,
  ownerMatchesExpected: false,
};

function formatJGT(value: bigint): string {
  const [whole, fraction = ""] = formatUnits(value, 18).split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

function formatETH(value: bigint): string {
  return `${formatUnits(value, 18)} ETH`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("user rejected")) return "The wallet request was cancelled.";
    return error.message.split(" (action=")[0].slice(0, 240);
  }
  return "The wallet request could not be completed.";
}

function makeProvider(): BrowserProvider {
  if (!window.ethereum) throw new Error("No compatible browser wallet was detected.");
  return new BrowserProvider(window.ethereum as ConstructorParameters<typeof BrowserProvider>[0]);
}

function getFaucet(dispenserAddress: string, runner: Signer | BrowserProvider): Contract {
  return new Contract(dispenserAddress, FAUCET_ABI, runner);
}

export default function JGTClaimFaucet({ dispenserAddress, dispenserCodeHash, expectedCleanOwner }: JGTClaimFaucetProps) {
  const configuredAddress = dispenserAddress.trim();
  const configuredCodeHash = dispenserCodeHash.trim();
  const configuredExpectedOwner = expectedCleanOwner.trim();
  const addressIsConfigured = isAddress(configuredAddress)
    && configuredAddress !== ZeroAddress
    && isHexString(configuredCodeHash, 32);
  const expectedOwnerIsConfigured = isAddress(configuredExpectedOwner)
    && configuredExpectedOwner !== ZeroAddress
    && configuredExpectedOwner.toLowerCase() !== COMPROMISED_DEPLOYER_ADDRESS.toLowerCase();
  const faucetActive = addressIsConfigured && expectedOwnerIsConfigured;
  const [account, setAccount] = useState("");
  const [onBase, setOnBase] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [gasQuote, setGasQuote] = useState<GasQuote | null>(null);
  const [relayerAddress, setRelayerAddress] = useState("");
  const [signedClaim, setSignedClaim] = useState<SignedClaim | null>(null);
  const [busy, setBusy] = useState<"connect" | "refresh" | "quote" | "claim" | "sign" | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [adNotice, setAdNotice] = useState<Record<string, string>>({});

  const refresh = useCallback(async (walletAddress = account): Promise<Snapshot | null> => {
    if (!faucetActive || !walletAddress) return null;
    const provider = makeProvider();
    const network = await provider.getNetwork();
    const isBase = network.chainId === BASE_CHAIN_ID;
    setOnBase(isBase);
    if (!isBase) {
      setSnapshot(EMPTY_SNAPSHOT);
      setGasQuote(null);
      return null;
    }

    const dispenserCode = await provider.getCode(getAddress(configuredAddress));
    if (dispenserCode === "0x" || keccak256(dispenserCode).toLowerCase() !== configuredCodeHash.toLowerCase()) {
      throw new Error("The dispenser bytecode does not match the independently reviewed code hash configured for this site.");
    }
    const faucet = getFaucet(getAddress(configuredAddress), provider);
    const [tokenAddress, accrued, claimable, remainingFaucetSupply, lastClaimAt, nonce] = await Promise.all([
      faucet.getFunction("token").staticCall(),
      faucet.getFunction("accrued").staticCall(walletAddress),
      faucet.getFunction("claimable").staticCall(walletAddress),
      faucet.getFunction("remainingFaucetSupply").staticCall(),
      faucet.getFunction("lastClaimAt").staticCall(walletAddress),
      faucet.getFunction("nonces").staticCall(walletAddress),
    ]);
    if (String(tokenAddress).toLowerCase() !== JGT_TOKEN_ADDRESS.toLowerCase()) {
      throw new Error("This dispenser is not configured for the JGT token address shown here.");
    }
    const token = new Contract(
      JGT_TOKEN_ADDRESS,
      [
        "function owner() view returns (address)",
        "function authorizedMinters(address minter) view returns (bool)",
      ],
      provider,
    );
    const [tokenOwner, authorizedMinter] = await Promise.all([
      token.getFunction("owner").staticCall(),
      token.getFunction("authorizedMinters").staticCall(getAddress(configuredAddress)),
    ]);
    const currentOwner = String(tokenOwner).toLowerCase();
    const ownerIsCompromised = currentOwner === COMPROMISED_DEPLOYER_ADDRESS.toLowerCase();
    const ownerMatchesExpected = currentOwner === getAddress(configuredExpectedOwner).toLowerCase();
    const minterAuthorized = ownerMatchesExpected && !ownerIsCompromised && Boolean(authorizedMinter);

    const nextSnapshot: Snapshot = {
      accrued: BigInt(accrued),
      claimable: BigInt(claimable),
      lastClaimAt: BigInt(lastClaimAt),
      nonce: BigInt(nonce),
      remainingFaucetSupply: BigInt(remainingFaucetSupply),
      minterAuthorized: Boolean(minterAuthorized),
      ownerIsCompromised,
      ownerMatchesExpected,
    };
    setSnapshot(nextSnapshot);
    setGasQuote(null);
    setSignedClaim(null);
    return nextSnapshot;
  }, [account, faucetActive, configuredAddress, configuredCodeHash, configuredExpectedOwner]);

  const connectWallet = async () => {
    setBusy("connect");
    setProblem("");
    setNotice("");
    setAccount("");
    setOnBase(false);
    setSnapshot(EMPTY_SNAPSHOT);
    setGasQuote(null);
    setSignedClaim(null);
    try {
      const provider = makeProvider();
      const accounts = await provider.send("eth_requestAccounts", []) as string[];
      if (!accounts[0]) throw new Error("The wallet did not return an account.");
      const walletAddress = getAddress(accounts[0]);
      assertSafeClaimAccount(walletAddress);
      setAccount(walletAddress);
      const network = await provider.getNetwork();
      const isBase = network.chainId === BASE_CHAIN_ID;
      setOnBase(isBase);
      if (!isBase) {
        setSnapshot(EMPTY_SNAPSHOT);
        setNotice("Connected wallet is not on Base mainnet. Switch networks to view or claim JGT.");
      } else {
        await refresh(walletAddress);
        setNotice("Wallet connected. No transaction has been sent.");
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const switchToBase = async () => {
    setBusy("connect");
    setProblem("");
    setNotice("");
    try {
      if (!window.ethereum) throw new Error("No compatible browser wallet was detected.");
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_CHAIN_ID_HEX }],
      });
      const provider = makeProvider();
      const network = await provider.getNetwork();
      const isBase = network.chainId === BASE_CHAIN_ID;
      setOnBase(isBase);
      if (isBase && account) {
        await refresh(account);
        setNotice("Switched to Base mainnet.");
      } else if (!isBase) {
        setNotice("The wallet is still on another network.");
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const refreshClick = async () => {
    setBusy("refresh");
    setProblem("");
    setNotice("");
    try {
      await refresh();
      setNotice("Claim balance refreshed from Base.");
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const quoteGas = async () => {
    setBusy("quote");
    setProblem("");
    setNotice("");
    try {
      if (!account || !onBase) throw new Error("Connect a wallet on Base mainnet first.");
      assertSafeClaimAccount(account);
      const latestSnapshot = await refresh();
      if (!latestSnapshot || latestSnapshot.claimable === ZERO) throw new Error("There are no JGT tokens available to claim right now.");
      if (!latestSnapshot.minterAuthorized) throw new Error("The faucet has not been authorized by the token owner as a minter yet.");
      const provider = makeProvider();
      const signer = await provider.getSigner(account);
      const faucet = getFaucet(getAddress(configuredAddress), signer);
      const [gasLimit, feeData] = await Promise.all([
        faucet.getFunction("claim").estimateGas(),
        provider.getFeeData(),
      ]);
      const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!maxFeePerGas) throw new Error("The wallet did not provide a current Base fee estimate.");
      setGasQuote({ gasLimit, maxFeePerGas, executionFee: gasLimit * maxFeePerGas });
      setNotice("Gas estimate refreshed. Your wallet will show the final fee before you approve a claim.");
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const claimDirectly = async () => {
    setBusy("claim");
    setProblem("");
    setNotice("");
    try {
      if (!account || !onBase) throw new Error("Connect a wallet on Base mainnet first.");
      assertSafeClaimAccount(account);
      if (!gasQuote) throw new Error("Get a gas estimate before submitting the claim.");
      const latestSnapshot = await refresh();
      if (!latestSnapshot || latestSnapshot.claimable === ZERO) throw new Error("There are no JGT tokens available to claim right now.");
      if (!latestSnapshot.minterAuthorized) throw new Error("The faucet has not been authorized by the token owner as a minter yet.");
      const provider = makeProvider();
      const signer = await provider.getSigner(account);
      const faucet = getFaucet(getAddress(configuredAddress), signer);
      const transaction = await faucet.getFunction("claim").send();
      setNotice(`Claim submitted: ${transaction.hash}. Waiting for Base confirmation…`);
      await transaction.wait();
      setNotice("Claim confirmed on Base. JGT was minted to your wallet.");
      await refresh(account);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const signSponsoredClaim = async () => {
    setBusy("sign");
    setProblem("");
    setNotice("");
    try {
      if (!account || !onBase) throw new Error("Connect a wallet on Base mainnet first.");
      assertSafeClaimAccount(account);
      const latestSnapshot = await refresh();
      if (!latestSnapshot || latestSnapshot.claimable === ZERO) throw new Error("There are no JGT tokens available to claim right now.");
      if (!latestSnapshot.minterAuthorized) throw new Error("The faucet has not been authorized by the token owner as a minter yet.");
      const relayer = relayerAddress.trim() ? getAddress(relayerAddress.trim()) : ZeroAddress;
      assertSafeClaimAccount(relayer);
      const deadline = Math.floor(Date.now() / 1000) + 15 * 60;
      const provider = makeProvider();
      const signer = await provider.getSigner(account);
      const faucet = getFaucet(getAddress(configuredAddress), provider);
      const nonce = await faucet.getFunction("nonces").staticCall(account) as bigint;
      const amount = latestSnapshot.claimable;
      const domain = {
        name: "JGTClaimDispenser",
        version: "1",
        chainId: Number(BASE_CHAIN_ID),
        verifyingContract: getAddress(configuredAddress),
      };
      const value = { account, amount, nonce, deadline, relayer };
      const signature = await signer.signTypedData(domain, CLAIM_TYPES, value);
      setSignedClaim({
        chainId: Number(BASE_CHAIN_ID),
        tokenAddress: JGT_TOKEN_ADDRESS,
        dispenserAddress: getAddress(configuredAddress),
        account,
        amount: amount.toString(),
        nonce: nonce.toString(),
        deadline,
        relayer,
        signature,
      });
      setNotice("Claim authorization signed. No transaction was sent and no gas was paid. A relayer must submit it before it expires.");
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const downloadSignedClaim = () => {
    if (!signedClaim) return;
    const blob = new Blob([JSON.stringify(signedClaim, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "jgt-sponsored-claim.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const hasAccount = Boolean(account);

  return (
    <section className="jgt-faucet" aria-labelledby="jgt-faucet-title">
      <div className="jgt-faucet-intro">
        <span className="jg-eyebrow">Base · legacy JGT token</span>
        <h1 id="jgt-faucet-title">A small token, on your terms.</h1>
        <p>
          Claim 2 JGT on your first claim, then 2 JGT for every completed 24-hour period. The dispenser mints
          only up to the JGT token&apos;s remaining supply cap and must first be authorized by the token&apos;s
          verified, uncompromised owner. Unclaimed periods carry forward.
        </p>
      </div>

      <div className="jgt-faucet-grid">
        <article className="jgt-faucet-card jgt-faucet-main-card">
          <div className="jgt-faucet-card-top">
            <div><span className="jg-eyebrow">Your claim</span><h2>Check your JGT</h2></div>
            <span className={`jgt-network-badge ${onBase ? "is-online" : ""}`}>{onBase ? "Base connected" : "Base mainnet"}</span>
          </div>

          {hasAccount && <p className="jgt-wallet-address">Connected wallet <code>{account}</code></p>}

          {!faucetActive ? (
            <div className="jgt-faucet-alert" role="status">
              The faucet is not active yet. No claim can be made until the reviewed minting contract is deployed,
              independently verified, authorized by the token&apos;s clean current owner, and its address and reviewed
              runtime-code hash and expected clean-owner address are configured here. Never use the compromised original deployer wallet.
            </div>
          ) : (
            <>
              {hasAccount && onBase && snapshot.ownerIsCompromised && (
                <div className="jgt-faucet-alert" role="alert">
                  The on-chain JGT token still reports the compromised original deployer as owner. Claims stay
                  disabled until ownership is moved to and verified under a clean wallet. Never use the compromised
                  wallet to authorize, fund, or sign anything.
                </div>
              )}
              {hasAccount && onBase && !snapshot.ownerIsCompromised && !snapshot.ownerMatchesExpected && (
                <div className="jgt-faucet-alert" role="alert">
                  The on-chain token owner does not match the independently verified clean-owner address configured
                  for this faucet. Claims remain disabled until both sources are checked and the site configuration is
                  updated. Do not authorize from the compromised wallet.
                </div>
              )}
              {hasAccount && onBase && snapshot.ownerMatchesExpected && !snapshot.minterAuthorized && (
                <div className="jgt-faucet-alert" role="status">
                  The verified clean token owner has not currently authorized this dispenser as a minter. Claims
                  remain unavailable until the owner completes and verifies that action.
                </div>
              )}
              <div className="jgt-faucet-balance-grid">
                <div><span>Accrued</span><strong>{hasAccount && onBase ? `${formatJGT(snapshot.accrued)} JGT` : "—"}</strong></div>
                <div><span>Available to claim</span><strong>{hasAccount && onBase ? `${formatJGT(snapshot.claimable)} JGT` : "—"}</strong></div>
                <div><span>Remaining faucet allotment</span><strong>{hasAccount && onBase ? `${formatJGT(snapshot.remainingFaucetSupply)} JGT` : "—"}</strong></div>
              </div>
              <p className="jgt-faucet-note">
                The first 2 JGT are immediately claimable. After that, 2 JGT accrue per completed 24-hour
                period from the previous paid period. Simply visiting or connecting does not start the clock;
                your first successful claim does.
              </p>

              {gasQuote && (
                <div className="jgt-gas-quote" aria-live="polite">
                  <strong>Estimated Base execution fee</strong>
                  <span>{formatETH(gasQuote.executionFee)}</span>
                  <small>
                    Estimate: {gasQuote.gasLimit.toString()} gas at up to {formatUnits(gasQuote.maxFeePerGas, 9)} gwei.
                    This is an execution-fee estimate, not a guaranteed all-in quote; Base&apos;s L1 data fee and
                    wallet settings can change the total. Use the amount shown by your wallet before confirming.
                  </small>
                </div>
              )}

              <div className="jgt-faucet-actions">
                {!hasAccount ? (
                  <button className="jg-button jg-button-primary" type="button" onClick={connectWallet} disabled={busy !== null}>
                    {busy === "connect" ? "Connecting…" : "Connect wallet"}
                  </button>
                ) : !onBase ? (
                  <button className="jg-button jg-button-primary" type="button" onClick={switchToBase} disabled={busy !== null}>
                    {busy === "connect" ? "Switching…" : "Switch to Base"}
                  </button>
                ) : (
                  <>
                    <button className="jg-button jg-button-secondary" type="button" onClick={refreshClick} disabled={busy !== null}>
                      {busy === "refresh" ? "Refreshing…" : "Refresh balance"}
                    </button>
                    <button className="jg-button jg-button-secondary" type="button" onClick={quoteGas} disabled={busy !== null || snapshot.claimable === ZERO || !snapshot.minterAuthorized}>
                      {busy === "quote" ? "Estimating…" : "Quote gas"}
                    </button>
                    <button className="jg-button jg-button-primary" type="button" onClick={claimDirectly} disabled={busy !== null || snapshot.claimable === ZERO || !snapshot.minterAuthorized || !gasQuote}>
                      {busy === "claim" ? "Claiming…" : gasQuote ? `Claim ${formatJGT(snapshot.claimable)} JGT` : "Quote gas to enable claim"}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {notice && <p className="jgt-feedback jgt-feedback-ok" role="status">{notice}</p>}
          {problem && <p className="jgt-feedback jgt-feedback-error" role="alert">{problem}</p>}
        </article>

        <aside className="jgt-faucet-card jgt-faucet-relayer-card">
          <span className="jg-eyebrow">Optional gas sponsor</span>
          <h2>Let a relayer submit your claim</h2>
          <p>
            If someone is sponsoring claims, you can sign a one-use authorization instead of sending a
            transaction yourself. The signature only permits the stated JGT amount to your connected wallet;
            it cannot move other assets. A relayer must submit it and pay the Base transaction fee.
          </p>
          <label htmlFor="jgt-relayer-address">Bind to a relayer address <small>optional</small></label>
          <input
            id="jgt-relayer-address"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x… (leave blank to allow any relayer)"
            value={relayerAddress}
            onChange={(event) => setRelayerAddress(event.target.value)}
            disabled={!hasAccount || !onBase || !faucetActive || busy !== null}
          />
          <p className="jgt-faucet-note">
            Binding the signature to the sponsor&apos;s address avoids another relayer submitting it first. Blank
            means any relayer can submit it. Signed requests expire after 15 minutes and are invalidated after
            a claim or nonce change.
          </p>
          <a className="jgt-relayer-guide" href="https://github.com/topnodrog/junctiongenerator/blob/main/docs/JGT_FAUCET.md#sponsored-claims-and-relayer-operation" target="_blank" rel="noopener noreferrer">Open the relayer guide and code ↗</a>
          <div className="jgt-relayer-bounty">
            <strong>Proposed gas-sponsor bounty: 10,000 JGT</strong>
            <p>
              The owner has stated a conditional offer for an operator who fronts gas for at least 100 sponsored
              claims and continues until the remaining token supply cap is distributed. This is not escrowed or
              guaranteed by the contract. Do not front ETH until the owner publishes final terms and independently
              verifiable escrow.
            </p>
          </div>
          <button
            className="jg-button jg-button-secondary"
            type="button"
            onClick={signSponsoredClaim}
            disabled={!hasAccount || !onBase || !faucetActive || snapshot.claimable === ZERO || !snapshot.minterAuthorized || busy !== null}
          >
            {busy === "sign" ? "Waiting for wallet signature…" : "Sign sponsored claim"}
          </button>
          {signedClaim && (
            <div className="jgt-signed-claim" role="status">
              <strong>Authorization ready</strong>
              <p>{formatJGT(BigInt(signedClaim.amount))} JGT for <code>{signedClaim.account}</code></p>
              <button className="jg-button jg-button-primary" type="button" onClick={downloadSignedClaim}>
                Download signed request
              </button>
            </div>
          )}
        </aside>
      </div>

      <section className="jgt-ad-section" aria-labelledby="jgt-ads-title">
        <div className="jgt-ad-section-heading">
          <span className="jg-eyebrow">Three future sponsor spots</span>
          <h2 id="jgt-ads-title">Three spaces for future ads</h2>
          <p>
            Planned reward: 1 JGT per successfully verified 30–60 second ad. These slots are informational only
            until a server-side completion check exists; no click or browser video event awards tokens.
          </p>
        </div>
        <div className="jgt-ad-grid">
          {AD_SLOTS.map((slot, index) => (
            <article className="jgt-ad-card" key={slot.id}>
              <div className="jgt-ad-card-heading">
                <span className="jg-eyebrow">Ad slot {String(index + 1).padStart(2, "0")}</span>
                <span className="jgt-ad-duration">{slot.durationSeconds} sec</span>
              </div>
              {slot.videoSrc ? (
                <video controls playsInline preload="metadata" aria-label={`Advertisement slot ${index + 1}`}>
                  <source src={slot.videoSrc} />
                  Your browser does not support embedded video.
                </video>
              ) : (
                <div className="jgt-ad-placeholder" aria-label="Available advertisement space">
                  <span>30–60 sec creative</span>
                  <strong>You can be advertising here</strong>
                </div>
              )}
              <button
                className="jg-button jg-button-secondary jgt-ad-button"
                type="button"
                onClick={() => setAdNotice((current) => ({
                  ...current,
                  [slot.id]: "You can be advertising here",
                }))}
              >
                {slot.videoSrc ? "Watch sponsored video" : "You can be advertising here"}
              </button>
              {adNotice[slot.id] && <p className="jgt-feedback jgt-feedback-ok" role="status">{adNotice[slot.id]}</p>}
            </article>
          ))}
        </div>
        <p className="jgt-ad-setup-note">
          To add a creative, set that slot&apos;s <code>videoSrc</code> in <code>AD_SLOTS</code> to a same-origin
          MP4 or WebM asset that is 30–60 seconds long. Do not pay ad rewards from a browser-only playback event.
        </p>
      </section>

      <div className="jgt-faucet-disclosures">
        <p><strong>Token:</strong> <a href={`https://basescan.org/token/${JGT_TOKEN_ADDRESS}`} target="_blank" rel="noopener noreferrer">{JGT_TOKEN_ADDRESS}</a> · 18 decimals · Base mainnet.</p>
        {faucetActive && <p><strong>Dispenser:</strong> <a href={`https://basescan.org/address/${getAddress(configuredAddress)}`} target="_blank" rel="noopener noreferrer">{getAddress(configuredAddress)}</a></p>}
        {faucetActive && <p><strong>Expected runtime code hash:</strong> <code>{configuredCodeHash}</code></p>}
        {faucetActive && <p><strong>Configured clean token owner:</strong> <code>{getAddress(configuredExpectedOwner)}</code></p>}
        <p>
          Claims mint JGT only after the dispenser has been authorized by the token&apos;s current owner, and the
          token contract enforces its hard maximum supply. The original deployer wallet is compromised and must
          never be used. A wallet address is not proof of a unique person, so multiple wallets can bypass a
          per-wallet limit. JGT is a legacy token with no promised market value. Never enter a seed phrase or
          approve an unrelated token allowance here; a normal claim only calls the dispenser&apos;s <code>claim()</code> function.
        </p>
      </div>
    </section>
  );
}
