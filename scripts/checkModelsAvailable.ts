/**
 * Check Models Availability
 *
 * This script verifies that all models from the agent catalog are accessible
 * via the AiMo Network provider by making minimal test requests.
 *
 * Usage:
 *   npx tsx scripts/checkModelsAvailable.ts           # Check all enabled models
 *   npx tsx scripts/checkModelsAvailable.ts --all     # Check all models (including disabled)
 *   npx tsx scripts/checkModelsAvailable.ts --model X # Check specific model by ID
 *
 * Environment:
 *   WALLET_<SERIES>_PRIVATE - Private keys for each model series
 */

import "dotenv/config";

import { aimoNetwork } from "@aimo.network/provider";
import { SvmClientSigner, SOLANA_MAINNET_CHAIN_ID } from "@aimo.network/svm";
import { createKeyPairSignerFromBytes, getBase58Encoder } from "@solana/kit";
import { generateText } from "ai";
import { MODELS } from "../lib/ai/models/catalog";
import type { ModelDefinition } from "../lib/ai/models/types";

const AIMO_BASE_URL = "https://beta.aimo.network";

// Wallet private keys by series
const WALLET_PRIVATE_KEYS: Record<string, string | undefined> = {
  gpt: process.env.WALLET_GPT_PRIVATE,
  claude: process.env.WALLET_CLAUDE_PRIVATE,
  deepseek: process.env.WALLET_DEEPSEEK_PRIVATE,
  glm: process.env.WALLET_GLM_PRIVATE,
  grok: process.env.WALLET_GROK_PRIVATE,
  qwen: process.env.WALLET_QWEN_PRIVATE,
  gemini: process.env.WALLET_GEMINI_PRIVATE,
  kimi: process.env.WALLET_KIMI_PRIVATE,
};

interface CheckResult {
  modelId: string;
  modelName: string;
  series: string;
  success: boolean;
  responseTime?: number;
  error?: string;
}

/**
 * Create an AiMo Network provider with the specified wallet.
 */
async function createProvider(privateKeyBase58: string) {
  const encoder = getBase58Encoder();
  const secretKeyBytes = encoder.encode(privateKeyBase58);
  const keypairSigner = await createKeyPairSignerFromBytes(secretKeyBytes);

  const signer = new SvmClientSigner({
    signer: keypairSigner,
    chainId: SOLANA_MAINNET_CHAIN_ID,
  });

  return aimoNetwork({
    signer,
    baseURL: AIMO_BASE_URL,
  });
}

/**
 * Check a single model's availability with a minimal request.
 */
async function checkModel(model: ModelDefinition): Promise<CheckResult> {
  const series = model.series ?? "unknown";
  const aimoModelId = model.providerIds?.aimo ?? model.id;

  // Check if wallet is configured
  const privateKey = WALLET_PRIVATE_KEYS[series];
  if (!privateKey) {
    return {
      modelId: model.id,
      modelName: model.name,
      series,
      success: false,
      error: `No wallet configured (WALLET_${series.toUpperCase()}_PRIVATE not set)`,
    };
  }

  const startTime = Date.now();

  try {
    const provider = await createProvider(privateKey);

    // Make a minimal test request
    const result = await generateText({
      model: provider.chat(aimoModelId),
      prompt: "Say OK",
      maxTokens: 5,
    } as Parameters<typeof generateText>[0]);

    const responseTime = Date.now() - startTime;

    // Verify we got a response
    if (!result.text || result.text.trim().length === 0) {
      return {
        modelId: model.id,
        modelName: model.name,
        series,
        success: false,
        responseTime,
        error: "Empty response received",
      };
    }

    return {
      modelId: model.id,
      modelName: model.name,
      series,
      success: true,
      responseTime,
    };
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";

    return {
      modelId: model.id,
      modelName: model.name,
      series,
      success: false,
      responseTime,
      error: errorMessage,
    };
  }
}

/**
 * Print check results summary.
 */
function printResults(results: CheckResult[]): void {
  console.log("\n" + "=".repeat(80));
  console.log("Model Availability Check Results");
  console.log("=".repeat(80) + "\n");

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  // Print successful checks
  if (successful.length > 0) {
    console.log(`✅ Available (${successful.length}):\n`);
    for (const result of successful) {
      const time = result.responseTime ? `${result.responseTime}ms` : "N/A";
      console.log(`   ${result.modelName.padEnd(20)} (${result.modelId})`);
      console.log(`   └─ Response time: ${time}\n`);
    }
  }

  // Print failed checks
  if (failed.length > 0) {
    console.log(`❌ Unavailable (${failed.length}):\n`);
    for (const result of failed) {
      console.log(`   ${result.modelName.padEnd(20)} (${result.modelId})`);
      console.log(`   └─ Error: ${result.error}\n`);
    }
  }

  // Summary
  console.log("=".repeat(80));
  console.log(
    `Summary: ${successful.length}/${results.length} models available`
  );
  console.log("=".repeat(80) + "\n");
}

/**
 * Check for missing wallet configurations.
 */
function checkWalletConfig(): void {
  const missingSeries: string[] = [];

  for (const [series, key] of Object.entries(WALLET_PRIVATE_KEYS)) {
    if (!key) {
      missingSeries.push(series);
    }
  }

  if (missingSeries.length > 0) {
    console.log("\n⚠️  Missing wallet configurations:");
    for (const series of missingSeries) {
      console.log(`   - WALLET_${series.toUpperCase()}_PRIVATE`);
    }
    console.log();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkAll = args.includes("--all");
  const modelIdArg = args.find((arg, i) => args[i - 1] === "--model");

  console.log("\n🔍 AiMo Network Model Availability Check\n");

  // Check wallet configuration
  checkWalletConfig();

  // Get models to check
  let modelsToCheck: ModelDefinition[];

  if (modelIdArg) {
    const model = MODELS.find(
      (m) => m.id === modelIdArg || m.name === modelIdArg
    );
    if (!model) {
      console.error(`❌ Model not found: ${modelIdArg}`);
      console.log("\nAvailable models:");
      for (const m of MODELS) {
        console.log(`   - ${m.id} (${m.name})`);
      }
      process.exit(1);
    }
    modelsToCheck = [model];
  } else if (checkAll) {
    modelsToCheck = MODELS;
  } else {
    modelsToCheck = MODELS.filter((m) => m.enabled);
  }

  console.log(`Checking ${modelsToCheck.length} model(s)...\n`);

  // Check each model sequentially to avoid rate limits
  const results: CheckResult[] = [];

  for (const model of modelsToCheck) {
    const aimoModelId = model.providerIds?.aimo ?? model.id;
    process.stdout.write(
      `  Checking ${model.name.padEnd(20)} (${aimoModelId})... `
    );

    const result = await checkModel(model);
    results.push(result);

    if (result.success) {
      console.log(`✅ OK (${result.responseTime}ms)`);
    } else {
      console.log(`❌ FAILED`);
    }
  }

  // Print summary
  printResults(results);

  // Exit with error code if any models failed
  const failedCount = results.filter((r) => !r.success).length;
  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
