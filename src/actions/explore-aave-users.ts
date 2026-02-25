import prompts from "prompts";
import Table from "cli-table3";
import colors from "colors";
import { Address, formatUnits } from "viem";
import { AAVE_MARKETS, AaveMarket } from "@/lib/aave/markets";
import { createPublicClientForChain } from "@/clients/viem";
import { Token, getTokenHolders } from "@/lib/token-holders/token-holders";

type TokenType = "supply" | "borrow";

const resolveMarket = async (marketName?: string): Promise<AaveMarket> => {
  if (marketName) {
    const found = AAVE_MARKETS.find((m) => m.name === marketName);
    if (!found) {
      throw new Error(
        `Unknown market "${marketName}". Available: ${AAVE_MARKETS.map((m) => m.name).join(", ")}`
      );
    }
    return found;
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

const resolveAsset = async (
  market: AaveMarket,
  assetSymbol?: string
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

  const { asset } = await prompts({
    type: "select",
    name: "asset",
    message: "Select an asset",
    choices: symbols.map((s) => ({ title: s, value: s })),
  });

  if (!asset) throw new Error("No asset selected");
  return asset;
};

const resolveTokenType = async (tokenType?: string): Promise<TokenType> => {
  if (tokenType) {
    if (tokenType !== "supply" && tokenType !== "borrow") {
      throw new Error(`tokenType must be "supply" or "borrow"`);
    }
    return tokenType;
  }

  const { type } = await prompts({
    type: "select",
    name: "type",
    message: "What do you want to explore?",
    choices: [
      { title: "Supply (aToken holders)", value: "supply" },
      { title: "Borrow (vToken holders)", value: "borrow" },
    ],
  });

  if (!type) throw new Error("No token type selected");
  return type;
};

export const exploreAaveUsersAction = async (
  marketArg: string | undefined,
  assetArg: string | undefined,
  tokenTypeArg: string | undefined,
  {
    blockNumber,
    top,
    progressBar,
  }: { blockNumber?: string; top?: string; progressBar?: boolean }
) => {
  const market = await resolveMarket(marketArg);
  const assetSymbol = await resolveAsset(market, assetArg);
  const tokenType = await resolveTokenType(tokenTypeArg);

  const rpcUrl = process.env[market.rpcEnvVar];
  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL for ${market.name}. Set the ${market.rpcEnvVar} environment variable in your .env file.`
    );
  }

  const assetConfig = market.market.ASSETS[assetSymbol];
  const tokenAddress =
    tokenType === "supply" ? assetConfig.A_TOKEN : assetConfig.V_TOKEN;
  const decimals = assetConfig.decimals;

  const client = createPublicClientForChain(market.chain, rpcUrl);

  const endBlock = blockNumber
    ? BigInt(blockNumber)
    : await client.getBlockNumber();

  const label = tokenType === "supply" ? "aToken" : "vToken";
  const tokenName = `${market.name}_${assetSymbol}_${label}`;

  const token: Token = {
    address: tokenAddress as Address,
    name: tokenName,
    deploymentBlock: market.deploymentBlock,
  };

  console.log(
    `\nFetching ${tokenType === "supply" ? "suppliers" : "borrowers"} for ${colors.green(assetSymbol)} on ${colors.green(market.name)} at block ${endBlock}...\n`
  );

  const holders = await getTokenHolders(token, endBlock, {
    network: market.chain,
    displayProgressBar: progressBar,
    client,
  });

  // Sort descending by balance and take top N
  const topN = top ? parseInt(top, 10) : 10;
  const sorted = [...holders.entries()]
    .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
    .slice(0, topN);

  if (sorted.length === 0) {
    console.log("No holders found.");
    return;
  }

  const positionLabel = tokenType === "supply" ? "Supplied" : "Borrowed";
  const table = new Table({
    head: [
      colors.green("Rank"),
      colors.green("Address"),
      colors.green(`${positionLabel} (${assetSymbol})`),
    ],
  });

  sorted.forEach(([address, balance], i) => {
    table.push([i + 1, address, formatUnits(balance, decimals)]);
  });

  console.log(table.toString());
};
