/**
 * Source of truth for all Aave markets in this project.
 *
 * Generates src/lib/aave/markets.ts by binary-searching on-chain for the block
 * at which each market's POOL contract was first deployed.
 *
 * Usage:
 *   bun run generate-markets
 *
 * Requires all RPC_* env vars to be set in .env.
 */

import {
  createPublicClient,
  http,
  getAddress,
  type Chain,
  type Address,
} from "viem";
import {
  arbitrum,
  avalanche,
  base,
  bsc,
  celo,
  gnosis,
  linea,
  mainnet,
  mantle,
  megaeth,
  metis,
  optimism,
  polygon,
  scroll,
  zkSync,
} from "viem/chains";
import {
  AaveV2Avalanche,
  AaveV2Ethereum,
  AaveV2EthereumAMM,
  AaveV2Polygon,
  AaveV3Arbitrum,
  AaveV3Avalanche,
  AaveV3Base,
  AaveV3BNB,
  AaveV3Celo,
  AaveV3Ethereum,
  AaveV3EthereumEtherFi,
  AaveV3EthereumLido,
  AaveV3Gnosis,
  AaveV3Linea,
  AaveV3Mantle,
  AaveV3MegaEth,
  AaveV3Metis,
  AaveV3Optimism,
  AaveV3Polygon,
  AaveV3Scroll,
  AaveV3ZkSync,
} from "@aave-dao/aave-address-book";
import { writeFileSync } from "fs";
import { resolve } from "path";
import { config as loadEnv } from "dotenv";

loadEnv();

// ─── Market specs (source of truth) ──────────────────────────────────────────

type MarketSpec = {
  /** Name matching the @aave-dao/aave-address-book export */
  name: string;
  /**
   * PoolAddressesProvider address — the first contract deployed for a market.
   * Used to binary-search the true market deployment block.
   */
  poolAddressesProvider: Address;
  chain: Chain;
  /** Variable name to emit in the generated file (must be a viem/chains export) */
  chainVar: string;
  rpcEnvVar: string;
};

const MARKET_SPECS: MarketSpec[] = [
  // Ethereum
  { name: "AaveV3Ethereum", poolAddressesProvider: getAddress(AaveV3Ethereum.POOL_ADDRESSES_PROVIDER), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV3EthereumLido", poolAddressesProvider: getAddress(AaveV3EthereumLido.POOL_ADDRESSES_PROVIDER), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV3EthereumEtherFi", poolAddressesProvider: getAddress(AaveV3EthereumEtherFi.POOL_ADDRESSES_PROVIDER), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV2Ethereum", poolAddressesProvider: getAddress(AaveV2Ethereum.POOL_ADDRESSES_PROVIDER), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV2EthereumAMM", poolAddressesProvider: getAddress(AaveV2EthereumAMM.POOL_ADDRESSES_PROVIDER), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  // Polygon
  { name: "AaveV3Polygon", poolAddressesProvider: getAddress(AaveV3Polygon.POOL_ADDRESSES_PROVIDER), chain: polygon, chainVar: "polygon", rpcEnvVar: "RPC_POLYGON" },
  { name: "AaveV2Polygon", poolAddressesProvider: getAddress(AaveV2Polygon.POOL_ADDRESSES_PROVIDER), chain: polygon, chainVar: "polygon", rpcEnvVar: "RPC_POLYGON" },
  // Arbitrum
  { name: "AaveV3Arbitrum", poolAddressesProvider: getAddress(AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER), chain: arbitrum, chainVar: "arbitrum", rpcEnvVar: "RPC_ARBITRUM" },
  // Optimism
  { name: "AaveV3Optimism", poolAddressesProvider: getAddress(AaveV3Optimism.POOL_ADDRESSES_PROVIDER), chain: optimism, chainVar: "optimism", rpcEnvVar: "RPC_OPTIMISM" },
  // Avalanche
  { name: "AaveV3Avalanche", poolAddressesProvider: getAddress(AaveV3Avalanche.POOL_ADDRESSES_PROVIDER), chain: avalanche, chainVar: "avalanche", rpcEnvVar: "RPC_AVALANCHE" },
  { name: "AaveV2Avalanche", poolAddressesProvider: getAddress(AaveV2Avalanche.POOL_ADDRESSES_PROVIDER), chain: avalanche, chainVar: "avalanche", rpcEnvVar: "RPC_AVALANCHE" },
  // Base
  { name: "AaveV3Base", poolAddressesProvider: getAddress(AaveV3Base.POOL_ADDRESSES_PROVIDER), chain: base, chainVar: "base", rpcEnvVar: "RPC_BASE" },
  // BNB
  { name: "AaveV3BNB", poolAddressesProvider: getAddress(AaveV3BNB.POOL_ADDRESSES_PROVIDER), chain: bsc, chainVar: "bsc", rpcEnvVar: "RPC_BNB" },
  // Gnosis
  { name: "AaveV3Gnosis", poolAddressesProvider: getAddress(AaveV3Gnosis.POOL_ADDRESSES_PROVIDER), chain: gnosis, chainVar: "gnosis", rpcEnvVar: "RPC_GNOSIS" },
  // Scroll
  { name: "AaveV3Scroll", poolAddressesProvider: getAddress(AaveV3Scroll.POOL_ADDRESSES_PROVIDER), chain: scroll, chainVar: "scroll", rpcEnvVar: "RPC_SCROLL" },
  // Metis
  { name: "AaveV3Metis", poolAddressesProvider: getAddress(AaveV3Metis.POOL_ADDRESSES_PROVIDER), chain: metis, chainVar: "metis", rpcEnvVar: "RPC_METIS" },
  // Linea
  { name: "AaveV3Linea", poolAddressesProvider: getAddress(AaveV3Linea.POOL_ADDRESSES_PROVIDER), chain: linea, chainVar: "linea", rpcEnvVar: "RPC_LINEA" },
  // ZkSync
  { name: "AaveV3ZkSync", poolAddressesProvider: getAddress(AaveV3ZkSync.POOL_ADDRESSES_PROVIDER), chain: zkSync, chainVar: "zkSync", rpcEnvVar: "RPC_ZKSYNC" },
  // Celo
  { name: "AaveV3Celo", poolAddressesProvider: getAddress(AaveV3Celo.POOL_ADDRESSES_PROVIDER), chain: celo, chainVar: "celo", rpcEnvVar: "RPC_CELO" },
  // Mantle
  { name: "AaveV3Mantle", poolAddressesProvider: getAddress(AaveV3Mantle.POOL_ADDRESSES_PROVIDER), chain: mantle, chainVar: "mantle", rpcEnvVar: "RPC_MANTLE" },
  // MegaETH
  { name: "AaveV3MegaEth", poolAddressesProvider: getAddress(AaveV3MegaEth.POOL_ADDRESSES_PROVIDER), chain: megaeth, chainVar: "megaeth", rpcEnvVar: "RPC_MEGAETH" },
];

// ─── Deployment block binary search ──────────────────────────────────────────

async function findDeploymentBlock(
  address: Address,
  client: ReturnType<typeof createPublicClient>,
): Promise<bigint> {
  const currentBlock = await client.getBlockNumber();

  const codeNow = await client.getBytecode({ address, blockNumber: currentBlock });
  if (!codeNow || codeNow === "0x") {
    throw new Error(
      `Contract ${address} has no code at block ${currentBlock}. Wrong address or chain?`,
    );
  }

  let lo = 0n;
  let hi = currentBlock;

  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await client.getBytecode({ address, blockNumber: mid });
    if (code && code !== "0x") {
      hi = mid;
    } else {
      lo = mid + 1n;
    }
  }

  return lo;
}

// ─── File generation ──────────────────────────────────────────────────────────

type ResolvedSpec = MarketSpec & { deploymentBlock: bigint };

function generateFile(results: ResolvedSpec[]): string {
  const abImports = results
    .map((r) => r.name)
    .sort()
    .join(",\n  ");

  const chainImports = [...new Set(results.map((r) => r.chainVar))]
    .sort()
    .join(",\n  ");

  const marketEntries = results
    .map(
      (r) =>
        `  {\n    name: "${r.name}",\n    market: ${r.name} as unknown as AaveMarketConfig,\n    chain: ${r.chainVar},\n    deploymentBlock: ${r.deploymentBlock}n,\n    rpcEnvVar: "${r.rpcEnvVar}",\n  }`,
    )
    .join(",\n");

  return `// DO NOT EDIT — generated by scripts/generate-markets.ts
// Run \`bun run generate-markets\` to regenerate.

import {
  ${abImports},
} from "@aave-dao/aave-address-book";
import {
  ${chainImports},
} from "viem/chains";
import { type Chain } from "viem";

export type AaveAsset = {
  decimals: number;
  UNDERLYING: string;
  A_TOKEN: string;
  V_TOKEN: string;
  [key: string]: unknown;
};

export type AaveMarketConfig = {
  CHAIN_ID: number;
  ASSETS: Record<string, AaveAsset>;
  [key: string]: unknown;
};

export type AaveMarket = {
  name: string;
  market: AaveMarketConfig;
  chain: Chain;
  deploymentBlock: bigint;
  rpcEnvVar: string;
};

export const AAVE_MARKETS: AaveMarket[] = [
${marketEntries},
];
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const missingEnvVars = [
    ...new Set(MARKET_SPECS.map((s) => s.rpcEnvVar)),
  ].filter((v) => !process.env[v]);

  if (missingEnvVars.length > 0) {
    console.error(`Missing env vars: ${missingEnvVars.join(", ")}`);
    process.exit(1);
  }

  const clientByEnvVar = new Map<string, ReturnType<typeof createPublicClient>>();
  const getClient = (rpcEnvVar: string) => {
    if (!clientByEnvVar.has(rpcEnvVar)) {
      clientByEnvVar.set(
        rpcEnvVar,
        createPublicClient({ transport: http(process.env[rpcEnvVar]!) }),
      );
    }
    return clientByEnvVar.get(rpcEnvVar)!;
  };

  console.log(`Fetching deployment blocks for ${MARKET_SPECS.length} markets...\n`);

  const results = await Promise.all(
    MARKET_SPECS.map(async (spec) => {
      const client = getClient(spec.rpcEnvVar);
      process.stdout.write(`  ${spec.name} (${spec.poolAddressesProvider}) ...`);
      const deploymentBlock = await findDeploymentBlock(spec.poolAddressesProvider, client);
      process.stdout.write(` block ${deploymentBlock}\n`);
      return { ...spec, deploymentBlock };
    }),
  );

  const outPath = resolve(__dirname, "../src/lib/aave/markets.ts");
  writeFileSync(outPath, generateFile(results));
  console.log(`\n✓ Written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
