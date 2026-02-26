import { Address, PublicClient, Chain, erc20Abi } from "viem";
import { AAVE_MARKETS } from "@/lib/aave/markets";

export type AavePosition = {
  symbol: string;
  balance: bigint;
  decimals: number;
};

export type AddressTag = {
  ens?: string;
  isContract: boolean;
  aaveSupplying?: AavePosition[]; // aToken positions with current balance
  aaveBorrowing?: AavePosition[]; // vToken positions with current balance
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

  const [bytecode, ensName, aavePositions] = await Promise.all([
    client.getBytecode({ address }).catch(() => undefined),
    mainnetClient
      ? mainnetClient.getEnsName({ address }).catch(() => null)
      : Promise.resolve(null),
    getAavePositions(address, chain, client),
  ]);

  return {
    isContract: !!(bytecode && bytecode !== "0x"),
    ens: ensName ?? undefined,
    aaveSupplying:
      aavePositions.supplying.length > 0 ? aavePositions.supplying : undefined,
    aaveBorrowing:
      aavePositions.borrowing.length > 0 ? aavePositions.borrowing : undefined,
  };
};

/**
 * Uses a single multicall to check all aToken and vToken balances on the chain.
 * Returns positions (symbol + balance + decimals) with balance > 0.
 * Balances for the same symbol across V2/V3 markets are summed.
 */
const getAavePositions = async (
  address: Address,
  chain: Chain,
  client: PublicClient,
): Promise<{ supplying: AavePosition[]; borrowing: AavePosition[] }> => {
  const marketsOnChain = AAVE_MARKETS.filter((m) => m.chain.id === chain.id);

  const checks: {
    symbol: string;
    aToken: Address;
    vToken: Address;
    decimals: number;
  }[] = [];
  for (const market of marketsOnChain) {
    for (const [symbol, asset] of Object.entries(market.market.ASSETS)) {
      checks.push({
        symbol,
        aToken: asset.A_TOKEN as Address,
        vToken: asset.V_TOKEN as Address,
        decimals: asset.decimals,
      });
    }
  }

  if (checks.length === 0) return { supplying: [], borrowing: [] };

  // Interleave: [aToken0, vToken0, aToken1, vToken1, ...]
  const results = await client
    .multicall({
      contracts: checks.flatMap(({ aToken, vToken }) => [
        {
          address: aToken,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address] as readonly [Address],
        },
        {
          address: vToken,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [address] as readonly [Address],
        },
      ]),
      allowFailure: true,
    })
    .catch(() => [] as { status: string; result?: unknown }[]);

  // Sum balances for same symbol across V2/V3 markets
  const supplyMap = new Map<string, AavePosition>();
  const borrowMap = new Map<string, AavePosition>();

  const addTo = (
    map: Map<string, AavePosition>,
    { symbol, decimals }: { symbol: string; decimals: number },
    balance: bigint,
  ) => {
    const existing = map.get(symbol);
    if (existing) existing.balance += balance;
    else map.set(symbol, { symbol, balance, decimals });
  };

  for (let i = 0; i < checks.length; i++) {
    const aResult = results[i * 2];
    const vResult = results[i * 2 + 1];
    if (aResult?.status === "success" && (aResult.result as bigint) > 0n)
      addTo(supplyMap, checks[i], aResult.result as bigint);
    if (vResult?.status === "success" && (vResult.result as bigint) > 0n)
      addTo(borrowMap, checks[i], vResult.result as bigint);
  }

  return {
    supplying: [...supplyMap.values()],
    borrowing: [...borrowMap.values()],
  };
};
