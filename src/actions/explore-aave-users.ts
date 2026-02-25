import prompts from "prompts";
import Table from "cli-table3";
import colors from "colors";
import { Address, formatUnits } from "viem";
import { createPublicClientForChain } from "@/clients/viem";
import { Token, getTokenHolders } from "@/lib/token-holders/token-holders";
import { resolveMarket, resolveAsset } from "@/lib/aave/resolvers";

type TokenType = "supply" | "borrow";

const resolveTokenType = async (
  tokenType?: string,
  interactive = true,
): Promise<TokenType> => {
  if (tokenType) {
    if (tokenType !== "supply" && tokenType !== "borrow") {
      throw new Error(`tokenType must be "supply" or "borrow"`);
    }
    return tokenType;
  }

  if (!interactive) {
    throw new Error(
      `Missing required argument: tokenType. Must be "supply" or "borrow"`,
    );
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
    interactive = true,
  }: {
    blockNumber?: string;
    top?: string;
    progressBar?: boolean;
    interactive?: boolean;
  },
) => {
  const market = await resolveMarket(marketArg, interactive);
  const assetSymbol = await resolveAsset(market, assetArg, interactive);
  const tokenType = await resolveTokenType(tokenTypeArg, interactive);

  const rpcUrl = process.env[market.rpcEnvVar];
  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL for ${market.name}. Set the ${market.rpcEnvVar} environment variable in your .env file.`,
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
    `\nFetching ${tokenType === "supply" ? "suppliers" : "borrowers"} for ${colors.green(assetSymbol)} on ${colors.green(market.name)} at block ${endBlock}...\n`,
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
