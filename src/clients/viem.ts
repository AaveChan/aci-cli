import { Chain, createPublicClient, http } from "viem";
import { createWalletClient } from "viem";

import { mainnet } from "viem/chains";

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.RPC_MAINNET),
});

export const walletClient = createWalletClient({
  chain: mainnet,
  transport: http(process.env.RPC_MAINNET),
});

export const createPublicClientForChain = (chain: Chain, rpcUrl?: string) =>
  createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
