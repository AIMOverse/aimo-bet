// ============================================================================
// Gas Sponsor Service
// Platform wallet that sponsors transaction fees for agent trades
// ============================================================================

import { type KeyPairSigner } from "@solana/kit";
import { createSignerFromBase58SecretKey } from "./wallets";

let sponsorSigner: KeyPairSigner | null = null;
let sponsorAddress: string | null = null;

/**
 * Get the sponsor signer (lazy initialization)
 * Returns null if SPONSOR_PRIVATE_KEY is not configured
 */
export async function getSponsorSigner(): Promise<KeyPairSigner | null> {
  if (sponsorSigner) return sponsorSigner;

  const privateKey = process.env.SPONSOR_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("[sponsor] SPONSOR_PRIVATE_KEY not configured - sponsorship disabled");
    return null;
  }

  sponsorSigner = await createSignerFromBase58SecretKey(privateKey);
  sponsorAddress = sponsorSigner.address;
  console.log("[sponsor] Sponsor wallet initialized:", sponsorAddress);

  return sponsorSigner;
}

/**
 * Get the sponsor wallet address
 * Returns null if not configured
 */
export async function getSponsorAddress(): Promise<string | null> {
  if (sponsorAddress) return sponsorAddress;

  const signer = await getSponsorSigner();
  return signer?.address ?? null;
}

/**
 * Check if sponsorship is enabled
 */
export function isSponsorshipEnabled(): boolean {
  return !!process.env.SPONSOR_PRIVATE_KEY;
}
