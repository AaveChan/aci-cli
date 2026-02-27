import {
  AaveV2Avalanche,
  AaveV2Ethereum,
  AaveV2EthereumAMM,
  AaveV2Polygon,
  AaveV3Arbitrum,
  AaveV3Avalanche,
  AaveV3BNB,
  AaveV3Base,
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
import {
  mainnet,
  polygon,
  arbitrum,
  avalanche,
  optimism,
  base,
  gnosis,
  bsc,
  celo,
  linea,
  mantle,
  metis,
  scroll,
  zkSync,
} from "viem/chains";
import { Chain, defineChain } from "viem";

const megaEth = defineChain({
  id: 4326,
  name: "MegaETH",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.megaeth.com/rpc"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://megaeth.blockscout.com" },
  },
});

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
  // Ethereum markets
  {
    name: "AaveV3Ethereum",
    market: AaveV3Ethereum as unknown as AaveMarketConfig,
    chain: mainnet,
    deploymentBlock: 16291127n,
    rpcEnvVar: "RPC_MAINNET",
  },
  {
    name: "AaveV3EthereumLido",
    market: AaveV3EthereumLido as unknown as AaveMarketConfig,
    chain: mainnet,
    deploymentBlock: 20275923n,
    rpcEnvVar: "RPC_MAINNET",
  },
  {
    name: "AaveV3EthereumEtherFi",
    market: AaveV3EthereumEtherFi as unknown as AaveMarketConfig,
    chain: mainnet,
    deploymentBlock: 19784479n,
    rpcEnvVar: "RPC_MAINNET",
  },
  {
    name: "AaveV2Ethereum",
    market: AaveV2Ethereum as unknown as AaveMarketConfig,
    chain: mainnet,
    deploymentBlock: 11362579n,
    rpcEnvVar: "RPC_MAINNET",
  },
  {
    name: "AaveV2EthereumAMM",
    market: AaveV2EthereumAMM as unknown as AaveMarketConfig,
    chain: mainnet,
    deploymentBlock: 11759859n,
    rpcEnvVar: "RPC_MAINNET",
  },
  // Polygon markets
  {
    name: "AaveV3Polygon",
    market: AaveV3Polygon as unknown as AaveMarketConfig,
    chain: polygon,
    deploymentBlock: 25826125n,
    rpcEnvVar: "RPC_POLYGON",
  },
  {
    name: "AaveV2Polygon",
    market: AaveV2Polygon as unknown as AaveMarketConfig,
    chain: polygon,
    deploymentBlock: 12686921n,
    rpcEnvVar: "RPC_POLYGON",
  },
  // Arbitrum
  {
    name: "AaveV3Arbitrum",
    market: AaveV3Arbitrum as unknown as AaveMarketConfig,
    chain: arbitrum,
    deploymentBlock: 7742429n,
    rpcEnvVar: "RPC_ARBITRUM",
  },
  // Optimism
  {
    name: "AaveV3Optimism",
    market: AaveV3Optimism as unknown as AaveMarketConfig,
    chain: optimism,
    deploymentBlock: 4188962n,
    rpcEnvVar: "RPC_OPTIMISM",
  },
  // Avalanche
  {
    name: "AaveV3Avalanche",
    market: AaveV3Avalanche as unknown as AaveMarketConfig,
    chain: avalanche,
    deploymentBlock: 11970506n,
    rpcEnvVar: "RPC_AVALANCHE",
  },
  {
    name: "AaveV2Avalanche",
    market: AaveV2Avalanche as unknown as AaveMarketConfig,
    chain: avalanche,
    deploymentBlock: 4607723n,
    rpcEnvVar: "RPC_AVALANCHE",
  },
  // Base
  {
    name: "AaveV3Base",
    market: AaveV3Base as unknown as AaveMarketConfig,
    chain: base,
    deploymentBlock: 2357129n,
    rpcEnvVar: "RPC_BASE",
  },
  // BNB
  {
    name: "AaveV3BNB",
    market: AaveV3BNB as unknown as AaveMarketConfig,
    chain: bsc,
    deploymentBlock: 26971649n,
    rpcEnvVar: "RPC_BNB",
  },
  // Gnosis
  {
    name: "AaveV3Gnosis",
    market: AaveV3Gnosis as unknown as AaveMarketConfig,
    chain: gnosis,
    deploymentBlock: 27979955n,
    rpcEnvVar: "RPC_GNOSIS",
  },
  // Scroll
  {
    name: "AaveV3Scroll",
    market: AaveV3Scroll as unknown as AaveMarketConfig,
    chain: scroll,
    deploymentBlock: 1722312n,
    rpcEnvVar: "RPC_SCROLL",
  },
  // Metis
  {
    name: "AaveV3Metis",
    market: AaveV3Metis as unknown as AaveMarketConfig,
    chain: metis,
    deploymentBlock: 8022773n,
    rpcEnvVar: "RPC_METIS",
  },
  // Linea
  {
    name: "AaveV3Linea",
    market: AaveV3Linea as unknown as AaveMarketConfig,
    chain: linea,
    deploymentBlock: 6627897n,
    rpcEnvVar: "RPC_LINEA",
  },
  // ZkSync
  {
    name: "AaveV3ZkSync",
    market: AaveV3ZkSync as unknown as AaveMarketConfig,
    chain: zkSync,
    deploymentBlock: 31902848n,
    rpcEnvVar: "RPC_ZKSYNC",
  },
  // Celo
  {
    name: "AaveV3Celo",
    market: AaveV3Celo as unknown as AaveMarketConfig,
    chain: celo,
    deploymentBlock: 24347428n,
    rpcEnvVar: "RPC_CELO",
  },
  // Mantle
  {
    name: "AaveV3Mantle",
    market: AaveV3Mantle as unknown as AaveMarketConfig,
    chain: mantle,
    deploymentBlock: 90172818n,
    rpcEnvVar: "RPC_MANTLE",
  },
  // MegaETH
  {
    name: "AaveV3MegaEth",
    market: AaveV3MegaEth as unknown as AaveMarketConfig,
    chain: megaEth,
    deploymentBlock: 6657953n,
    rpcEnvVar: "RPC_MEGAETH",
  },
];
