import colors from "colors";
import { Address, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { createPublicClientForChain } from "@/clients/viem";
import { Token, getTokenHolders } from "@/lib/token-holders/token-holders";
import { resolveMarket, resolveAsset } from "@/lib/aave/resolvers";
import { traceOutflowsForAddress } from "@/actions/trace-borrower-outflows";

export const traceAllBorrowersAction = async (
  marketArg: string | undefined,
  assetArg: string | undefined,
  {
    blockNumber,
    top,
    progressBar,
    maskUnrelated = false,
    interactive = true,
  }: {
    blockNumber?: string;
    top?: string;
    progressBar?: boolean;
    maskUnrelated?: boolean;
    interactive?: boolean;
  },
) => {
  const market = await resolveMarket(marketArg, interactive);
  const assetSymbol = await resolveAsset(market, assetArg, interactive);

  const rpcUrl = process.env[market.rpcEnvVar];
  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL for ${market.name}. Set the ${market.rpcEnvVar} environment variable in your .env file.`,
    );
  }

  const assetConfig = market.market.ASSETS[assetSymbol];
  const client = createPublicClientForChain(market.chain, rpcUrl);

  const endBlock = blockNumber
    ? BigInt(blockNumber)
    : await client.getBlockNumber();

  const vToken: Token = {
    address: assetConfig.V_TOKEN as Address,
    name: `${market.name}_${assetSymbol}_vToken`,
    deploymentBlock: market.deploymentBlock,
  };

  console.log(
    `\nFetching borrowers for ${colors.green(assetSymbol)} on ${colors.green(market.name)} at block ${endBlock}...\n`,
  );

  const borrowers = await getTokenHolders(vToken, endBlock, {
    network: market.chain,
    displayProgressBar: progressBar,
    client,
  });

  if (borrowers.size === 0) {
    console.log("No borrowers found.");
    return;
  }

  const topN = top ? parseInt(top, 10) : 10;
  const topBorrowers = [...borrowers.entries()]
    .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
    .slice(0, topN);

  const mainnetClient =
    market.chain.id === mainnet.id
      ? client
      : process.env.RPC_MAINNET
        ? createPublicClientForChain(mainnet, process.env.RPC_MAINNET)
        : undefined;

  console.log(
    `\nTracing outflows for top ${topBorrowers.length} borrowers of ${colors.green(assetSymbol)} on ${colors.green(market.name)}...\n`,
  );

  for (const [address] of topBorrowers) {
    console.log(`\n${"═".repeat(80)}`);
    console.log(
      `Borrower: ${colors.cyan(address)}  [debt: ${colors.blue(formatUnits(borrowers.get(address)!, assetConfig.decimals))} ${assetSymbol}]`,
    );
    await traceOutflowsForAddress(
      address,
      market,
      assetSymbol,
      endBlock,
      topN,
      maskUnrelated,
      client,
      mainnetClient,
    );
  }
};
