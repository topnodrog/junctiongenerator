'use client';

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function ConnectButtonCustom() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="btn-glow-cyan"
                    style={{ padding: '8px 20px', fontSize: '14px', cursor: 'pointer' }}
                    type="button"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="btn-glow-purple"
                    style={{
                      padding: '8px 20px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      background: 'linear-gradient(135deg, var(--color-magenta) 0%, #9d174d 100%)',
                      borderColor: 'var(--color-magenta)',
                      boxShadow: '0 0 15px rgba(243, 85, 136, 0.4)',
                    }}
                    type="button"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {/* Chain Switcher Button */}
                  <button
                    onClick={openChainModal}
                    className="btn-glow-purple"
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    type="button"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 14,
                          height: 14,
                          borderRadius: 999,
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 14, height: 14 }}
                          />
                        )}
                      </div>
                    )}
                    <span>{chain.name}</span>
                  </button>

                  {/* Account / Address Button */}
                  <button
                    onClick={openAccountModal}
                    className="btn-glow-cyan"
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    type="button"
                  >
                    <span>{account.displayName}</span>
                    {account.displayBalance && (
                      <span
                        style={{
                          fontSize: '11px',
                          opacity: 0.8,
                          borderLeft: '1px solid rgba(0, 242, 254, 0.3)',
                          paddingLeft: '6px',
                          marginLeft: '2px',
                        }}
                      >
                        {account.displayBalance}
                      </span>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
