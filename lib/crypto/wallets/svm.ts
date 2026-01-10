// ============================================================================
// SVM (Solana) Signer Factory
// Creates Solana signers for AiMo Network payments
// ============================================================================

import { SOLANA_RPC_URL } from "@/lib/config";
import { SvmClientSigner, SOLANA_MAINNET_CHAIN_ID } from "@aimo.network/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";

/**
 * Create an SVM client signer from a base58-encoded private key.
 * Used for Solana-based payments on AiMo Network.
 *
 * @param privateKeyBase58 - Solana private key in base58 format
 * @returns SvmClientSigner configured for mainnet
 */
export async function createSvmSigner(
  privateKeyBase58: string
): Promise<SvmClientSigner> {
  const encoder = getBase58Encoder();
  const secretKeyBytes = encoder.encode(privateKeyBase58);
  const keypairSigner = await createKeyPairSignerFromBytes(secretKeyBytes);

  return new SvmClientSigner({
    signer: keypairSigner,
    chainId: SOLANA_MAINNET_CHAIN_ID,
    config: {
      rpcUrl: SOLANA_RPC_URL,
    },
  });
}
