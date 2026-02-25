import prompts from "prompts";
import { AAVE_MARKETS, AaveMarket } from "@/lib/aave/markets";

export const resolveMarket = async (
  marketName?: string,
  interactive = true
): Promise<AaveMarket> => {
  if (marketName) {
    const found = AAVE_MARKETS.find((m) => m.name === marketName);
    if (!found) {
      throw new Error(
        `Unknown market "${marketName}". Available: ${AAVE_MARKETS.map((m) => m.name).join(", ")}`
      );
    }
    return found;
  }

  if (!interactive) {
    throw new Error(
      `Missing required argument: market. Available: ${AAVE_MARKETS.map((m) => m.name).join(", ")}`
    );
  }

  const { market } = await prompts({
    type: "select",
    name: "market",
    message: "Select an Aave market",
    choices: AAVE_MARKETS.map((m) => ({
      title: `${m.name} (chain: ${m.chain.name})`,
      value: m,
    })),
  });

  if (!market) throw new Error("No market selected");
  return market;
};

export const resolveAsset = async (
  market: AaveMarket,
  assetSymbol?: string,
  interactive = true
): Promise<string> => {
  const symbols = Object.keys(market.market.ASSETS);

  if (assetSymbol) {
    if (!symbols.includes(assetSymbol)) {
      throw new Error(
        `Unknown asset "${assetSymbol}" in ${market.name}. Available: ${symbols.join(", ")}`
      );
    }
    return assetSymbol;
  }

  if (!interactive) {
    throw new Error(
      `Missing required argument: asset. Available in ${market.name}: ${symbols.join(", ")}`
    );
  }

  const { asset } = await prompts({
    type: "select",
    name: "asset",
    message: "Select an asset",
    choices: symbols.map((s) => ({ title: s, value: s })),
  });

  if (!asset) throw new Error("No asset selected");
  return asset;
};
