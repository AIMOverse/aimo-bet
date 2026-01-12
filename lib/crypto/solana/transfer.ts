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
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { getRpc, TOKEN_MINTS, PROGRAM_IDS } from "./client";

// ============================================================================
// Associated Token Account (ATA) Constants
// ============================================================================

const ASSOCIATED_TOKEN_PROGRAM_ID =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// ============================================================================
// Types
// ============================================================================

export interface TransferResult {
  success: boolean;
  signature?: string;
  error?: string;
}

// ============================================================================
// ATA Derivation
// ============================================================================

/**
 * Derive the Associated Token Account (ATA) address for a wallet and mint.
 * ATAs are PDAs derived from: [walletAddress, tokenProgramId, mintAddress]
 *
 * @param walletAddress - The wallet (owner) address
 * @param mintAddress - The token mint address
 * @param tokenProgramId - Token program (default: SPL Token Program)
 * @returns The ATA address
 */
export async function getAssociatedTokenAddress(
  walletAddress: Address,
  mintAddress: Address,
  tokenProgramId: Address = address(PROGRAM_IDS.TOKEN)
): Promise<Address> {
  const encoder = getAddressEncoder();

  const [ata] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM_ID),
    seeds: [
      encoder.encode(walletAddress),
      encoder.encode(tokenProgramId),
      encoder.encode(mintAddress),
    ],
  });

  return ata;
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
  READONLY: 0,
} as const;

/** System Program ID */
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

/**
 * Build a CreateIdempotent instruction to create an ATA if it doesn't exist.
 * This is safe to call even if the ATA already exists (idempotent).
 *
 * Instruction accounts (in order):
 * 0. [writable, signer] Funding account (payer)
 * 1. [writable] Associated token account to create
 * 2. [] Wallet address (owner of the ATA)
 * 3. [] Token mint
 * 4. [] System program
 * 5. [] Token program
 */
function buildCreateIdempotentInstruction(
  payer: Address,
  ata: Address,
  walletAddress: Address,
  mintAddress: Address,
  tokenProgramId: Address = address(PROGRAM_IDS.TOKEN)
) {
  // CreateIdempotent instruction has no data, just the discriminator (1)
  const data = new Uint8Array([1]); // 1 = CreateIdempotent

  return {
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM_ID),
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: ata, role: AccountRole.WRITABLE },
      { address: walletAddress, role: AccountRole.READONLY },
      { address: mintAddress, role: AccountRole.READONLY },
      { address: address(SYSTEM_PROGRAM_ID), role: AccountRole.READONLY },
      { address: tokenProgramId, role: AccountRole.READONLY },
    ],
    data,
  };
}

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
 * @param feePayer - Optional separate fee payer (for gas sponsorship)
 * @returns Transfer result with signature
 */
export async function sendSPLTokens(
  signer: KeyPairSigner,
  destinationTokenAccount: string | Address,
  amount: bigint,
  mint: string = TOKEN_MINTS.USDC,
  feePayer?: KeyPairSigner
): Promise<TransferResult> {
  const logPrefix = "[solana/transfer]";
  const actualFeePayer = feePayer || signer;
  const destAddress =
    typeof destinationTokenAccount === "string"
      ? address(destinationTokenAccount)
      : destinationTokenAccount;

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
      destination: destAddress,
      amount: amount.toString(),
      mint,
      feePayer: actualFeePayer.address,
      sponsored: !!feePayer,
    });

    // Get recent blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // Build transfer instruction
    const transferInstruction = buildTransferInstruction(
      address(sourceTokenAccount),
      destAddress,
      signer.address,
      amount,
      address(PROGRAM_IDS.TOKEN)
    );

    // Build transaction message with fee payer
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(actualFeePayer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(transferInstruction, tx)
    );

    // Compile the message into a transaction
    const transaction = compileTransaction(transactionMessage);

    // Sign transaction with all required signers
    // If fee payer is different from signer, both need to sign
    const signerKeys = feePayer
      ? [signer.keyPair, feePayer.keyPair]
      : [signer.keyPair];

    const signedTransaction = await signTransaction(signerKeys, transaction);

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
 * Send USDC to a wallet address by deriving its ATA and creating it if needed.
 * This handles the common case where you have a wallet address
 * and need to send tokens to its Associated Token Account.
 *
 * The function automatically creates the destination ATA if it doesn't exist
 * using a CreateIdempotent instruction (safe to call even if ATA exists).
 *
 * @param signer - KeyPairSigner that owns the USDC
 * @param destinationWallet - Recipient's wallet address (NOT token account)
 * @param amountUSDC - Amount in USDC (human-readable, e.g., 100 for $100)
 * @param feePayer - Optional separate fee payer (for gas sponsorship)
 * @returns Transfer result with signature
 */
export async function sendUSDC(
  signer: KeyPairSigner,
  destinationWallet: string,
  amountUSDC: number,
  feePayer?: KeyPairSigner
): Promise<TransferResult> {
  const logPrefix = "[solana/transfer]";
  const actualFeePayer = feePayer || signer;

  try {
    const rpc = getRpc();

    // Derive the destination's ATA for USDC
    const destinationAta = await getAssociatedTokenAddress(
      address(destinationWallet),
      address(TOKEN_MINTS.USDC),
      address(PROGRAM_IDS.TOKEN)
    );

    console.log(
      `${logPrefix} Derived ATA for ${destinationWallet}: ${destinationAta}`
    );

    // Get signer's token account for USDC
    const { value: tokenAccounts } = await rpc
      .getTokenAccountsByOwner(
        signer.address,
        { mint: address(TOKEN_MINTS.USDC) },
        { encoding: "jsonParsed" }
      )
      .send();

    if (tokenAccounts.length === 0) {
      return {
        success: false,
        error: `No USDC token account found for signer`,
      };
    }

    // Use the first token account (usually the ATA)
    const sourceTokenAccount = tokenAccounts[0].pubkey;

    // Check balance
    const parsed = tokenAccounts[0].account.data.parsed;
    const balance = BigInt(parsed.info.tokenAmount.amount);
    const amount = BigInt(Math.floor(amountUSDC * 1_000_000));

    if (balance < amount) {
      return {
        success: false,
        error: `Insufficient balance. Have: ${balance}, Need: ${amount}`,
      };
    }

    console.log(`${logPrefix} Transfer details:`, {
      source: sourceTokenAccount,
      destination: destinationAta,
      destinationWallet,
      amount: amount.toString(),
      mint: TOKEN_MINTS.USDC,
      feePayer: actualFeePayer.address,
      sponsored: !!feePayer,
    });

    // Get recent blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    // Build CreateIdempotent instruction to create ATA if it doesn't exist
    const createAtaInstruction = buildCreateIdempotentInstruction(
      actualFeePayer.address, // Payer for ATA creation
      destinationAta,
      address(destinationWallet),
      address(TOKEN_MINTS.USDC),
      address(PROGRAM_IDS.TOKEN)
    );

    // Build transfer instruction
    const transferInstruction = buildTransferInstruction(
      address(sourceTokenAccount),
      destinationAta,
      signer.address,
      amount,
      address(PROGRAM_IDS.TOKEN)
    );

    // Build transaction message with both instructions
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayer(actualFeePayer.address, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstruction(createAtaInstruction, tx),
      (tx) => appendTransactionMessageInstruction(transferInstruction, tx)
    );

    // Compile the message into a transaction
    const transaction = compileTransaction(transactionMessage);

    // Sign transaction with all required signers
    // If fee payer is different from signer, both need to sign
    const signerKeys = feePayer
      ? [signer.keyPair, feePayer.keyPair]
      : [signer.keyPair];

    const signedTransaction = await signTransaction(signerKeys, transaction);

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
