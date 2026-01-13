import "dotenv/config";
import { maxUint256 } from "viem";
import {
  createPolygonWallet,
  getPublicClient,
  getWalletClient,
} from "@/lib/crypto/polygon/client";
import { createClobClient } from "@/lib/prediction-market/polymarket/clob";
import { POLYGON_USDC_ADDRESS } from "@/lib/config";

// Polymarket contracts that need approval
const POLYMARKET_CONTRACTS = [
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E", // CTF Exchange
  "0xC5d563A36AE78145C45a50134d48A1215220f80a", // Neg Risk CTF Exchange
  "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296", // Neg Risk Adapter
] as const;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main() {
  const privateKey = process.env.WALLET_GPT_EVM_PRIVATE;
  if (!privateKey) throw new Error("No WALLET_GPT_EVM_PRIVATE configured");

  const publicClient = getPublicClient();

  // Create wallet
  const wallet = createPolygonWallet(privateKey);
  const walletClient = getWalletClient(wallet._viemAccount);

  console.log("Wallet address:", wallet.address);

  const client = await createClobClient(wallet);
  console.log("CLOB client created");

  // Check balance and allowance
  const balanceAllowance = await client.getBalanceAllowance({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asset_type: "COLLATERAL" as any, // USDC.e
  });
  console.log("Balance/Allowance:", JSON.stringify(balanceAllowance, null, 2));

  // Check POL balance for gas
  const polBalance = await publicClient.getBalance({
    address: wallet.address as `0x${string}`,
  });
  console.log(`POL balance: ${Number(polBalance) / 1e18} POL`);

  if (polBalance === 0n) {
    console.log("\n⚠️  No POL for gas! Cannot approve contracts.");
    console.log("   Please fund the wallet with some POL for gas:");
    console.log(`   Address: ${wallet.address}`);
    console.log("   Required: ~0.05 POL for 3 approval transactions");
    console.log("\n   Options:");
    console.log("   1. Send POL from another wallet");
    console.log("   2. Bridge ETH/USDC to Polygon and swap for POL");
    console.log("   3. Use a Polygon faucet (if available)");
    return;
  }

  // Check on-chain allowances
  console.log("\n📋 Current on-chain allowances:");
  for (const contract of POLYMARKET_CONTRACTS) {
    const allowance = await publicClient.readContract({
      address: POLYGON_USDC_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [wallet.address as `0x${string}`, contract],
    });
    console.log(`  ${contract}: ${Number(allowance) / 1e6} USDC`);
  }

  // If any allowance is low, approve max
  console.log("\n🔄 Approving Polymarket contracts...");
  for (const contract of POLYMARKET_CONTRACTS) {
    const allowance = await publicClient.readContract({
      address: POLYGON_USDC_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [wallet.address as `0x${string}`, contract],
    });
    if (allowance < 1000000000n) {
      // Less than 1000 USDC
      console.log(`  Approving ${contract}...`);
      const hash = await walletClient.writeContract({
        address: POLYGON_USDC_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contract, maxUint256],
      });
      console.log(`    TX: ${hash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`    ✓ Confirmed in block ${receipt.blockNumber}`);
    } else {
      console.log(`  ${contract}: Already approved`);
    }
  }

  // Re-check after approval
  console.log("\n📋 Updated on-chain allowances:");
  for (const contract of POLYMARKET_CONTRACTS) {
    const allowance = await publicClient.readContract({
      address: POLYGON_USDC_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [wallet.address as `0x${string}`, contract],
    });
    console.log(`  ${contract}: ${Number(allowance) / 1e6} USDC`);
  }

  // Tell Polymarket about the allowance
  console.log("\n🔄 Updating Polymarket allowance cache...");
  await client.updateBalanceAllowance({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asset_type: "COLLATERAL" as any,
  });
  console.log("Update result:", "OK");
}

main().catch(console.error);
