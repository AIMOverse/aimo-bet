"use client";

import {
  CrossmintProvider,
  CrossmintAuthProvider,
  CrossmintWalletProvider,
} from "@crossmint/client-sdk-react-ui";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <CrossmintProvider apiKey={process.env.NEXT_PUBLIC_CROSSMINT_API_KEY ?? ""}>
      <CrossmintAuthProvider
        loginMethods={["email", "google", "web3"]} // Show email, Google, and external wallets as login methods
      >
        <CrossmintWalletProvider
          createOnLogin={{
            chain: "solana",
            signer: {
              type: "email",
            },
          }}
        >
          {children}
        </CrossmintWalletProvider>
      </CrossmintAuthProvider>
    </CrossmintProvider>
  );
}
