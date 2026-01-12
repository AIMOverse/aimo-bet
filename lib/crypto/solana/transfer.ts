// ============================================================================
// Solana SPL Token Transfer
// Send SPL tokens to another address using @solana/kit (Web3.js 2.0)
// ============================================================================

import {
  address,
  type Address,
  type KeyPairSigner,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  compileTransaction,
  signTransaction,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
} from "@solana/kit";
import { getRpc, TOKEN_MINTS, PROGRAM_IDS } from "./client";

// ============================================================================
// Types
// ============================================================================

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// ============================================================================
// SPL Token Transfer Instruction Builder
// ============================================================================

/**
 * Account role constants for instruction accounts
 * Based on @solana/kit account meta definitions
 */
const AccountRole = {
  WRITABLE: 1,
  SIGNER: 2,
  WRITABLE_SIGNER: 3,
} as const;

/**
 * Build an SPL Token transfer instruction
 * Transfer tokens from one token account to another
 *
 * Instruction layout (9 bytes):
 * - u8: instruction index (3 = transfer)
 * - u64: amount (little-endian)
 */
function buildTransferInstruction(
  sourceTokenAccount: Address,
  destinationTokenAccount: Address,
  ownerAddress: Address,
  amount: bigint,
  programId: Address = address(PROGRAM_IDS.TOKEN)
) {
  // Build instruction data: [3 (transfer), amount as u64 LE]
  const data = new Uint8Array(9);
  data[0] = 3; // Transfer instruction index

  // Write amount as little-endian u64
  const view = new DataView(data.buffer);
  view.setBigUint64(1, amount, true);

  return {
    programAddress: programId,
    accounts: [
      { address: sourceTokenAccount, role: AccountRole.WRITABLE },
      { address: destinationTokenAccount, role: AccountRole.WRITABLE },
      { address: ownerAddress, role: AccountRole.SIGNER },
    ],
    data,
  };
}

// ============================================================================
// Transfer Functions
// ============================================================================

/**
 * Send SPL tokens from signer's token account to a destination token account.
 *
 * NOTE: This sends to a TOKEN ACCOUNT, not a wallet address.
 * The destination should be an Associated Token Account (ATA) for the mint.
 *
 * @param signer - KeyPairSigner that owns the source tokens
 * @param destinationTokenAccount - Recipient's token account address (ATA)
 * @param amount - Amount in token base units (e.g., 1000000 for 1 USDC)
 * @param mint - Token mint address (default: USDC)
 * @returns Transfer result with signature
 */
export async function sendSPLTokens(
  signer: KeyPairSigner,
  destinationTokenAccount: string,
  amount: bigint,
  mint: string = TOKEN_MINTS.USDC
): Promise<TransferResult> {
  const logPrefix = "[solana/transfer]";

  try {
    const rpc = getRpc();

    // Get signer's token account for this mint
    const { value: tokenAccounts } = await rpc
      .getTokenAccountsByOwner(
        signer.address,
        { mint: address(mint) },
        { encoding: "jsonParsed" }
      )
      .send();

    if (tokenAccounts.length === 0) {
      return {
        success: false,
        error: `No token account found for mint ${mint}`,
      };
    }

    // Use the first token account (usually the ATA)
    const sourceTokenAccount = tokenAccounts[0].pubkey;

    // Check balance
    const parsed = tokenAccounts[0].account.data.parsed;
    const balance = BigInt(parsed.info.tokenAmount.amount);

    if (balance < amount) {
      return {
        success: false,
        error: `Insufficient balance. Have: ${balance}, Need: ${amount}`,
      };
    }

    console.log(`${logPrefix} Transfer details:`, {
      source: sourceTokenAccount,
      destination: destinationTokenAccount,
      amount: amount.toString(),
      mint,
    });

    // Get recent blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // Build transfer instruction
    const transferInstruction = buildTransferInstruction(
      address(sourceTokenAccount),
      address(destinationTokenAccount),
      signer.address,
      amount,
      address(PROGRAM_IDS.TOKEN)
    );

    // Build transaction message
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(signer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(transferInstruction, tx)
    );

    // Compile the message into a transaction
    const transaction = compileTransaction(transactionMessage);

    // Sign transaction
    const signedTransaction = await signTransaction(
      [signer.keyPair],
      transaction
    );

    // Get signature for tracking
    const signature = getSignatureFromTransaction(signedTransaction);

    // Encode and send
    const encodedTransaction =
      getBase64EncodedWireTransaction(signedTransaction);

    await rpc
      .sendTransaction(encodedTransaction, {
        encoding: "base64",
        skipPreflight: false,
        preflightCommitment: "confirmed",
      })
      .send();

    console.log(`${logPrefix} Transaction sent: ${signature}`);

    return {
      success: true,
      signature,
    };
  } catch (error) {
    console.error(`${logPrefix} Error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown transfer error",
    };
  }
}

/**
 * Send USDC to a destination token account.
 * Convenience wrapper around sendSPLTokens for USDC transfers.
 *
 * @param signer - KeyPairSigner that owns the USDC
 * @param destinationTokenAccount - Recipient's USDC token account (ATA)
 * @param amountUSDC - Amount in USDC (human-readable, e.g., 100 for $100)
 * @returns Transfer result with signature
 */
export async function sendUSDC(
  signer: KeyPairSigner,
  destinationTokenAccount: string,
  amountUSDC: number
): Promise<TransferResult> {
  // USDC has 6 decimals
  const amount = BigInt(Math.floor(amountUSDC * 1_000_000));
  return sendSPLTokens(signer, destinationTokenAccount, amount, TOKEN_MINTS.USDC);
}
