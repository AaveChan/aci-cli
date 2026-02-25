import prompts from "prompts";
import Table from "cli-table3";
import colors from "colors";
import { Address, formatUnits } from "viem";
import { createPublicClientForChain } from "@/clients/viem";
import {
  Token,
  getTokenHolders,
  fetchAddressOutflows,
} from "@/lib/token-holders/token-holders";
import { resolveMarket, resolveAsset } from "@/lib/aave/resolvers";

const resolveAddress = async (
  holders: Map<Address, bigint>,
  decimals: number,
  assetSymbol: string,
  addressArg?: string,
  interactive = true,
): Promise<Address> => {
  if (addressArg) {
    const normalized = addressArg.toLowerCase() as Address;
    const found = [...holders.keys()].find(
      (a) => a.toLowerCase() === normalized,
    );
    if (!found) {
      throw new Error(
        `Address "${addressArg}" is not in the borrower list for this asset.`,
      );
    }
    return found;
  }

  if (!interactive) {
    throw new Error(
      `Missing required argument: address. Must be one of the top borrowers.`,
    );
  }

  const { address } = await prompts({
    type: "select",
    name: "address",
    message: "Select a borrower address to trace",
    choices: [...holders.entries()]
      .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
      .slice(0, 50)
      .map(([addr, balance]) => ({
        title: addr,
        description: `Borrowed: ${formatUnits(balance, decimals)} ${assetSymbol}`,
        value: addr,
      })),
  });

  if (!address) throw new Error("No address selected");
  return address;
};

export const traceBorrowerOutflowsAction = async (
  marketArg: string | undefined,
  assetArg: string | undefined,
  addressArg: string | undefined,
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

  // Step 1: fetch borrowers (vToken holders)
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

  // Step 2: select address to trace
  const selectedAddress = await resolveAddress(
    borrowers,
    assetConfig.decimals,
    assetSymbol,
    addressArg,
    interactive,
  );

  // Step 3: fetch outflows of the underlying asset FROM that address
  const underlyingAddress = assetConfig.UNDERLYING as Address;
  const { decimals } = assetConfig;

  console.log(
    `\nFetching ${colors.green(assetSymbol)} outflows from ${colors.cyan(selectedAddress)} (block ${market.deploymentBlock} → ${endBlock})...\n`,
  );

  if (progressBar) progressBar && console.log(); // spacing before bar if used
  const outflows = await fetchAddressOutflows(
    underlyingAddress,
    selectedAddress,
    market.deploymentBlock,
    endBlock,
    false, // progress bar not wired here yet
    client,
  );

  if (outflows.length === 0) {
    console.log("No outgoing transfers found for this address.");
    return;
  }

  // Step 4: aggregate by recipient
  const totals = new Map<Address, bigint>();
  for (const event of outflows) {
    if (!event.to) continue;
    totals.set(event.to, (totals.get(event.to) ?? 0n) + event.value);
  }

  const topN = top ? parseInt(top, 10) : 10;
  const sorted = [...totals.entries()]
    .sort(([, a], [, b]) => (b > a ? 1 : b < a ? -1 : 0))
    .slice(0, topN);

  // Step 5: display
  const table = new Table({
    head: [
      colors.green("Rank"),
      colors.green("Recipient"),
      colors.green(`Total Sent (${assetSymbol})`),
    ],
  });

  sorted.forEach(([recipient, total], i) => {
    table.push([i + 1, recipient, formatUnits(total, decimals)]);
  });

  console.log(
    `\nTop ${topN} recipients of ${colors.green(assetSymbol)} from ${colors.cyan(selectedAddress)}:\n`,
  );
  console.log(table.toString());
};
