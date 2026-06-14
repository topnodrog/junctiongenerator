'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Junction Generator',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '8c13f64c6d0ad98dcbd0c978007a16f3', // Fallback placeholder project ID
  chains: [mainnet, sepolia, base, baseSepolia],
  ssr: true, // Required for Next.js App Router to prevent hydration mismatch
});
