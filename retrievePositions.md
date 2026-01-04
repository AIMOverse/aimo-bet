# Retrieve User Prediction Market Positions

How to fetch and identify a user’s prediction market positions using onchain data

This guide shows you how to retrieve a user’s prediction market positions by querying onchain token account data and mapping it to the DFlow Prediction Market Metadata API.
This quickstart assumes familiarity with Solana’s token accounts and RPC connections. If unfamiliar, please refer to the Solana Cookbook.
​
Overview
To retrieve a user’s prediction market positions, you’ll need to:
Fetch all token accounts owned by the user
Filter for outcome tokens
Map outcome token mints to market details using the Metadata API
Calculate position values
1
Fetch User's Token Accounts

Use Solana’s getTokenAccountsByOwner RPC method to retrieve all token accounts for a given user wallet.
Fetch Token Accounts

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

/// Create Solana RPC connection
const connection = new Connection("https://api.mainnet-beta.solana.com");

/// User wallet address
const userWallet = new PublicKey("USER_WALLET_ADDRESS_HERE");

/// Fetch token accounts owned by this user
const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
userWallet,
{
programId: TOKEN_2022_PROGRAM_ID,
}
);

/// Map into a simpler structure
const userTokens = tokenAccounts.value.map(({ account }) => {
const info = account.data.parsed.info;

return {
mint: info.mint,
rawBalance: info.tokenAmount.amount,
balance: info.tokenAmount.uiAmount,
decimals: info.tokenAmount.decimals,
};
});

/// Filter out zero balances
const nonZeroBalances = userTokens.filter((t) => t.balance > 0);
2
Identify Prediction Market Tokens

Use the /api/v1/filter_outcome_mints endpoint to filter the user’s token addresses and return only those that are prediction market outcome mints.
Filter Prediction Market Tokens

/// Base URL for the DFlow Prediction Market Metadata API
const METADATA_API_BASE_URL = "https://prediction-markets-api.dflow.net";

/// Extract all mint addresses from user's tokens
const allMintAddresses = nonZeroBalances.map((token) => token.mint);

/// Filter to get only prediction market outcome mints
const response = await fetch(
`${METADATA_API_BASE_URL}/api/v1/filter_outcome_mints`,
{
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({ addresses: allMintAddresses }),
}
);

if (!response.ok) {
throw new Error("Failed to filter outcome mints");
}

const data = await response.json();
const predictionMintAddresses = data.outcomeMints;
3
Fetch Market Details

Use the /api/v1/markets/batch endpoint to retrieve detailed market information for all outcome tokens in a single request, including event details, pricing, volume, and settlement status.
Get Market Details

/// Fetch market details for all outcome tokens in batch
const response = await fetch(`${METADATA_API_BASE_URL}/api/v1/markets/batch`, {
method: "POST",
headers: {
"Content-Type": "application/json",
},
body: JSON.stringify({ mints: predictionMintAddresses }),
});

if (!response.ok) {
throw new Error("Failed to fetch markets batch");
}

const data = await response.json();
const markets = data.markets;

/// Create a map by mint address for efficient lookup
const marketsByMint = new Map<string, any>();
markets.forEach((market: any) => {
/// Map by yesMint, noMint, and marketLedger
Object.values(market.accounts).forEach((account: any) => {
marketsByMint.set(account.yesMint, market);
marketsByMint.set(account.noMint, market);
marketsByMint.set(account.marketLedger, market);
});
});

/// Map outcome tokens to their market data and determine position type
const userPositions = outcomeTokens.map((token) => {
const marketData = marketsByMint.get(token.mint);

if (!marketData) {
return {
mint: token.mint,
balance: token.balance,
decimals: token.decimals,
position: "UNKNOWN",
market: null,
};
}

/// Determine if this is a YES or NO token
const isYesToken = Object.values(marketData.accounts).some(
(account: any) => account.yesMint === token.mint
);

const isNoToken = Object.values(marketData.accounts).some(
(account: any) => account.noMint === token.mint
);

return {
mint: token.mint,
balance: token.balance,
decimals: token.decimals,
position: isYesToken ? "YES" : isNoToken ? "NO" : "UNKNOWN",
market: marketData,
};
});
​
API Response Structure
The /api/v1/markets/batch endpoint returns comprehensive market data including:
Market Information: Title, subtitle, event ticker, category
Accounts: Token mint addresses (yesMint, noMint, marketLedger)
Timing: Open time, close time, expiration time
Market Data: Volume, open interest, status
Settlement: Result (if market is resolved)
Rules: Primary and secondary market rules
