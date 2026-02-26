import { Address, PublicClient, Chain, erc20Abi } from "viem";
import { AAVE_MARKETS } from "@/lib/aave/markets";

export type AddressTag = {
  ens?: string;
  isContract: boolean;
  aaveSupplying?: string[]; // asset symbols where address holds aTokens
};

/**
 * Resolves metadata tags for an address:
 * - ENS reverse name (requires a mainnet client)
 * - Whether the address is a smart contract
 * - Aave aToken holdings on the given chain
 */
export const resolveAddressTag = async (
  address: Address,
  chain: Chain,
  client: PublicClient,
  mainnetClient?: PublicClient,
): Promise<AddressTag> => {
  const [bytecode, ensName, aaveSupplying] = await Promise.all([
    client.getBytecode({ address }).catch(() => undefined),
    mainnetClient
      ? mainnetClient.getEnsName({ address }).catch(() => null)
      : Promise.resolve(null),
    getAaveSupplyingAssets(address, chain, client),
  ]);

  return {
    isContract: !!(bytecode && bytecode !== "0x"),
    ens: ensName ?? undefined,
    aaveSupplying: aaveSupplying.length > 0 ? aaveSupplying : undefined,
  };
};

/**
 * Uses multicall to check all aToken balances on the given chain.
 * Returns deduplicated list of asset symbols where balance > 0.
 */
const getAaveSupplyingAssets = async (
  address: Address,
  chain: Chain,
  client: PublicClient,
): Promise<string[]> => {
  const marketsOnChain = AAVE_MARKETS.filter((m) => m.chain.id === chain.id);

  const checks: { symbol: string; aToken: Address }[] = [];
  for (const market of marketsOnChain) {
    for (const [symbol, asset] of Object.entries(market.market.ASSETS)) {
      checks.push({ symbol, aToken: asset.A_TOKEN as Address });
    }
  }

  if (checks.length === 0) return [];

  const results = await client
    .multicall({
      contracts: checks.map(({ aToken }) => ({
        address: aToken,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [address] as readonly [Address],
      })),
      allowFailure: true,
    })
    .catch(() => [] as { status: string; result?: unknown }[]);

  const supplying: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "success" && (r.result as bigint) > 0n) {
      supplying.push(checks[i].symbol);
    }
  }

  // Deduplicate: same symbol may appear across V2/V3 markets
  return [...new Set(supplying)];
};
