/**
 * Generate Solana Keypairs for AI Agent Wallets
 *
 * Usage:
 *   npx tsx scripts/generateKeys.ts [count]
 *
 * Examples:
 *   npx tsx scripts/generateKeys.ts        # Generate 8 keypairs (default)
 *   npx tsx scripts/generateKeys.ts 3      # Generate 3 keypairs
 *
 * Output:
 *   Writes keypairs to .keys/ directory as JSON files (Solana CLI format)
 *   - .keys/wallet-1.json
 *   - .keys/wallet-2.json
 *   - etc.
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

const KEYS_DIR = ".keys";
const DEFAULT_COUNT = 8;

async function ensureKeysDir(): Promise<void> {
  try {
    await access(KEYS_DIR);
  } catch {
    await mkdir(KEYS_DIR, { recursive: true });
    console.log(`Created ${KEYS_DIR}/ directory`);
  }
}

async function generateAndSaveKeypair(index: number): Promise<string> {
  // Generate 32 random bytes for the private key
  const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));

  // Create signer with extractable=true so we can export the public key
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    privateKeyBytes,
    true // extractable
  );

  // Export the public key (raw format gives us the 32 bytes directly)
  const publicKeyBuffer = await crypto.subtle.exportKey(
    "raw",
    signer.keyPair.publicKey
  );
  const publicKeyBytes = new Uint8Array(publicKeyBuffer);

  // Solana CLI format: 64-byte array (32-byte private key + 32-byte public key)
  const secretKeyBytes = new Uint8Array(64);
  secretKeyBytes.set(privateKeyBytes, 0);
  secretKeyBytes.set(publicKeyBytes, 32);

  // Convert to JSON array format (Solana CLI compatible)
  const jsonArray = Array.from(secretKeyBytes);
  const filename = `wallet-${index}.json`;
  const filepath = join(KEYS_DIR, filename);

  await writeFile(filepath, JSON.stringify(jsonArray));

  return signer.address;
}

async function main(): Promise<void> {
  const count = parseInt(process.argv[2] || String(DEFAULT_COUNT), 10);

  if (isNaN(count) || count < 1) {
    console.error("Usage: npx tsx scripts/generateKeys.ts [count]");
    console.error("  count: Number of keypairs to generate (default: 8)");
    process.exit(1);
  }

  console.log(`Generating ${count} keypair(s)...\n`);

  await ensureKeysDir();

  for (let i = 1; i <= count; i++) {
    const address = await generateAndSaveKeypair(i);
    console.log(`  wallet-${i}.json: ${address}`);
  }

  console.log(`\nDone! Generated ${count} keypair(s) in ${KEYS_DIR}/`);
  console.log(
    `\nRun 'npx tsx scripts/listKeys.ts --env' to get environment variables.`
  );
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
