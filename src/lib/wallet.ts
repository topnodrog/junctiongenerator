// Wagmi config — wallet connection setup for Junction Generator
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { base, baseSepolia, mainnet } from "wagmi/chains";

export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "junctiongenerator-demo";

export const chains = [base, baseSepolia, mainnet] as const;

export const config = getDefaultConfig({
  appName: "Junction Generator",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [base, mainnet],
  ssr: false,
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
});
