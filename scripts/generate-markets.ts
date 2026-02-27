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
  /** POOL proxy address — used to binary-search the deployment block */
  poolAddress: Address;
  chain: Chain;
  /** Variable name to emit in the generated file (must be a viem/chains export) */
  chainVar: string;
  rpcEnvVar: string;
};

const MARKET_SPECS: MarketSpec[] = [
  // Ethereum
  { name: "AaveV3Ethereum", poolAddress: getAddress(AaveV3Ethereum.POOL), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV3EthereumLido", poolAddress: getAddress(AaveV3EthereumLido.POOL), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV3EthereumEtherFi", poolAddress: getAddress(AaveV3EthereumEtherFi.POOL), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV2Ethereum", poolAddress: getAddress(AaveV2Ethereum.POOL), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  { name: "AaveV2EthereumAMM", poolAddress: getAddress(AaveV2EthereumAMM.POOL), chain: mainnet, chainVar: "mainnet", rpcEnvVar: "RPC_MAINNET" },
  // Polygon
  { name: "AaveV3Polygon", poolAddress: getAddress(AaveV3Polygon.POOL), chain: polygon, chainVar: "polygon", rpcEnvVar: "RPC_POLYGON" },
  { name: "AaveV2Polygon", poolAddress: getAddress(AaveV2Polygon.POOL), chain: polygon, chainVar: "polygon", rpcEnvVar: "RPC_POLYGON" },
  // Arbitrum
  { name: "AaveV3Arbitrum", poolAddress: getAddress(AaveV3Arbitrum.POOL), chain: arbitrum, chainVar: "arbitrum", rpcEnvVar: "RPC_ARBITRUM" },
  // Optimism
  { name: "AaveV3Optimism", poolAddress: getAddress(AaveV3Optimism.POOL), chain: optimism, chainVar: "optimism", rpcEnvVar: "RPC_OPTIMISM" },
  // Avalanche
  { name: "AaveV3Avalanche", poolAddress: getAddress(AaveV3Avalanche.POOL), chain: avalanche, chainVar: "avalanche", rpcEnvVar: "RPC_AVALANCHE" },
  { name: "AaveV2Avalanche", poolAddress: getAddress(AaveV2Avalanche.POOL), chain: avalanche, chainVar: "avalanche", rpcEnvVar: "RPC_AVALANCHE" },
  // Base
  { name: "AaveV3Base", poolAddress: getAddress(AaveV3Base.POOL), chain: base, chainVar: "base", rpcEnvVar: "RPC_BASE" },
  // BNB
  { name: "AaveV3BNB", poolAddress: getAddress(AaveV3BNB.POOL), chain: bsc, chainVar: "bsc", rpcEnvVar: "RPC_BNB" },
  // Gnosis
  { name: "AaveV3Gnosis", poolAddress: getAddress(AaveV3Gnosis.POOL), chain: gnosis, chainVar: "gnosis", rpcEnvVar: "RPC_GNOSIS" },
  // Scroll
  { name: "AaveV3Scroll", poolAddress: getAddress(AaveV3Scroll.POOL), chain: scroll, chainVar: "scroll", rpcEnvVar: "RPC_SCROLL" },
  // Metis
  { name: "AaveV3Metis", poolAddress: getAddress(AaveV3Metis.POOL), chain: metis, chainVar: "metis", rpcEnvVar: "RPC_METIS" },
  // Linea
  { name: "AaveV3Linea", poolAddress: getAddress(AaveV3Linea.POOL), chain: linea, chainVar: "linea", rpcEnvVar: "RPC_LINEA" },
  // ZkSync
  { name: "AaveV3ZkSync", poolAddress: getAddress(AaveV3ZkSync.POOL), chain: zkSync, chainVar: "zkSync", rpcEnvVar: "RPC_ZKSYNC" },
  // Celo
  { name: "AaveV3Celo", poolAddress: getAddress(AaveV3Celo.POOL), chain: celo, chainVar: "celo", rpcEnvVar: "RPC_CELO" },
  // Mantle
  { name: "AaveV3Mantle", poolAddress: getAddress(AaveV3Mantle.POOL), chain: mantle, chainVar: "mantle", rpcEnvVar: "RPC_MANTLE" },
  // MegaETH
  { name: "AaveV3MegaEth", poolAddress: getAddress(AaveV3MegaEth.POOL), chain: megaeth, chainVar: "megaeth", rpcEnvVar: "RPC_MEGAETH" },
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
      process.stdout.write(`  ${spec.name} (${spec.poolAddress}) ...`);
      const deploymentBlock = await findDeploymentBlock(spec.poolAddress, client);
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
