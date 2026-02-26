import { Address, PublicClient, Chain, erc20Abi } from "viem";
import { AAVE_MARKETS } from "@/lib/aave/markets";

export type AddressTag = {
  ens?: string;
  isContract: boolean;
  aaveSupplying?: string[]; // asset symbols where address holds aTokens
  aTokenLabel?: string; // set when this address IS an aToken, e.g. "aUSDC (AaveV3Ethereum)"
};

/**
 * Pure synchronous lookup — returns a label like "aUSDC (AaveV3Ethereum)" if
 * the given address is a known Aave aToken contract on the chain, or undefined.
 * No RPC call needed.
 */
export const getATokenLabel = (
  address: Address,
  chain: Chain,
): string | undefined => {
  const normalized = address.toLowerCase();
  for (const market of AAVE_MARKETS) {
    if (market.chain.id !== chain.id) continue;
    for (const [symbol, asset] of Object.entries(market.market.ASSETS)) {
      if (asset.A_TOKEN.toLowerCase() === normalized) {
        return `a${symbol} (${market.name})`;
      }
    }
  }
  return undefined;
};

/**
 * Resolves metadata tags for an address:
 * - If the address is a known Aave aToken, returns immediately with its label.
 * - Otherwise: ENS reverse name, contract/EOA status, Aave aToken holdings.
 */
export const resolveAddressTag = async (
  address: Address,
  chain: Chain,
  client: PublicClient,
  mainnetClient?: PublicClient,
): Promise<AddressTag> => {
  // Fast-path: known aToken address — no RPC needed
  const aTokenLabel = getATokenLabel(address, chain);
  if (aTokenLabel) {
    return { isContract: true, aTokenLabel };
  }

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
