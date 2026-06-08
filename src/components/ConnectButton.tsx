"use client";

import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit";

export default function ConnectButton() {
  return (
    <RainbowConnectButton
      chainStatus="icon"
      showBalance={false}
      accountStatus={{
        smallScreen: "avatar",
        largeScreen: "full",
      }}
    />
  );
}
