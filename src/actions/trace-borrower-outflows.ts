import prompts from "prompts";
import colors from "colors";
import { Address, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { createPublicClientForChain } from "@/clients/viem";
import {
  Token,
  getTokenHolders,
  fetchAddressOutflows,
} from "@/lib/token-holders/token-holders";
import { resolveMarket, resolveAsset } from "@/lib/aave/resolvers";
import { resolveAddressTag, AddressTag } from "@/lib/address-tags";

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

const shortAddr = (addr: Address) => addr;

const formatTags = (tag: AddressTag): string => {
  const parts: string[] = [];
  if (tag.ens) parts.push(colors.cyan(`ENS: ${tag.ens}`));
  if (tag.aaveSupplying?.length)
    parts.push(colors.yellow(`Aave: ${tag.aaveSupplying.join(", ")}`));
  else if (tag.isContract) parts.push(colors.gray("Contract"));
  return parts.length > 0 ? `  [${parts.join("] [")}]` : "";
};

const renderFlowTree = (
  root: Address,
  level1: [Address, bigint][],
  pruned1: number,
  level2: Map<Address, [Address, bigint][]>,
  pruned2: Map<Address, number>,
  tagMap: Map<Address, AddressTag>,
  rootTotal: bigint,
  decimals: number,
  assetSymbol: string,
) => {
  const pct = (amount: bigint) =>
    rootTotal > 0n
      ? `${((Number(amount) * 100) / Number(rootTotal)).toFixed(1)}%`
      : "0.0%";

  const rootTag = tagMap.get(root);
  console.log(
    `\n${colors.cyan(shortAddr(root))}${rootTag ? formatTags(rootTag) : ""}  [total out: ${formatUnits(rootTotal, decimals)} ${assetSymbol}]`,
  );

  for (let i = 0; i < level1.length; i++) {
    const isLastL1 = i === level1.length - 1 && pruned1 === 0;
    const [addr, amount] = level1[i];
    const tag = tagMap.get(addr);
    const prefix1 = isLastL1 ? "└── " : "├── ";
    const cont1 = isLastL1 ? "    " : "│   ";

    console.log(
      `${prefix1}${colors.green(shortAddr(addr))}  ${formatUnits(amount, decimals)} ${assetSymbol}  (${pct(amount)})${tag ? formatTags(tag) : ""}`,
    );

    const children = level2.get(addr) ?? [];
    const childPruned = pruned2.get(addr) ?? 0;

    for (let j = 0; j < children.length; j++) {
      const isLastL2 = j === children.length - 1 && childPruned === 0;
      const [subAddr, subAmount] = children[j];
      const subTag = tagMap.get(subAddr);
      const prefix2 = isLastL2 ? "└── " : "├── ";

      console.log(
        `${cont1}${prefix2}${colors.green(shortAddr(subAddr))}  ${formatUnits(subAmount, decimals)} ${assetSymbol}  (${pct(subAmount)})${subTag ? formatTags(subTag) : ""}`,
      );
    }

    if (childPruned > 0) {
      console.log(
        `${cont1}└── ${colors.gray(`[${childPruned} recipient${childPruned > 1 ? "s" : ""} < 10% pruned]`)}`,
      );
    }
  }

  if (pruned1 > 0) {
    console.log(
      `└── ${colors.gray(`[${pruned1} recipient${pruned1 > 1 ? "s" : ""} < 10% pruned]`)}`,
    );
  }
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

  // Step 3: fetch level-1 outflows of the underlying asset FROM that address
  const underlyingAddress = assetConfig.UNDERLYING as Address;
  const { decimals } = assetConfig;

  console.log(
    `\nFetching ${colors.green(assetSymbol)} outflows from ${colors.cyan(selectedAddress)} (block ${market.deploymentBlock} → ${endBlock})...\n`,
  );

  const outflows = await fetchAddressOutflows(
    underlyingAddress,
    selectedAddress,
    market.deploymentBlock,
    endBlock,
    false,
    client,
  );

  if (outflows.length === 0) {
    console.log("No outgoing transfers found for this address.");
    return;
  }

  // Step 4: aggregate level-1 by recipient, apply 10% threshold
  const totals = new Map<Address, bigint>();
  for (const event of outflows) {
    if (!event.to) continue;
    totals.set(event.to, (totals.get(event.to) ?? 0n) + event.value);
  }

  const rootTotal = [...totals.values()].reduce((a, b) => a + b, 0n);
  const threshold = rootTotal / 10n; // 10% of total

  const topN = top ? parseInt(top, 10) : 10;
  const allSorted = [...totals.entries()].sort(([, a], [, b]) =>
    b > a ? 1 : b < a ? -1 : 0,
  );
  const level1 = allSorted.slice(0, topN).filter(([, v]) => v >= threshold);
  const pruned1 = allSorted.filter(([, v]) => v < threshold).length;

  // Step 5: fetch level-2 outflows for each level-1 recipient in parallel
  console.log(
    `\nFetching depth-2 outflows for ${level1.length} recipients...\n`,
  );

  const level2: Map<Address, [Address, bigint][]> = new Map();
  const pruned2: Map<Address, number> = new Map();

  await Promise.all(
    level1.map(async ([recipient]) => {
      const subOutflows = await fetchAddressOutflows(
        underlyingAddress,
        recipient,
        market.deploymentBlock,
        endBlock,
        false,
        client,
      );

      const subTotals = new Map<Address, bigint>();
      for (const event of subOutflows) {
        if (!event.to) continue;
        subTotals.set(event.to, (subTotals.get(event.to) ?? 0n) + event.value);
      }

      const subAllSorted = [...subTotals.entries()].sort(([, a], [, b]) =>
        b > a ? 1 : b < a ? -1 : 0,
      );
      // Prune relative to root total for consistent 10% threshold
      level2.set(
        recipient,
        subAllSorted.slice(0, topN).filter(([, v]) => v >= threshold),
      );
      pruned2.set(
        recipient,
        subAllSorted.filter(([, v]) => v < threshold).length,
      );
    }),
  );

  // Step 6: resolve tags for all unique addresses in parallel
  // Use mainnet client for ENS (ENS registry lives on mainnet)
  const mainnetClient =
    market.chain.id === mainnet.id
      ? client
      : process.env.RPC_MAINNET
        ? createPublicClientForChain(mainnet, process.env.RPC_MAINNET)
        : undefined;

  const allAddresses = new Set<Address>([selectedAddress]);
  for (const [addr] of level1) allAddresses.add(addr);
  for (const children of level2.values())
    for (const [addr] of children) allAddresses.add(addr);

  console.log(`Resolving tags for ${allAddresses.size} addresses...\n`);

  const tagMap = new Map<Address, AddressTag>();
  await Promise.all(
    [...allAddresses].map(async (addr) => {
      const tag = await resolveAddressTag(
        addr,
        market.chain,
        client,
        mainnetClient,
      );
      tagMap.set(addr, tag);
    }),
  );

  // Step 7: render flow tree
  console.log(
    `\nFlow graph for ${colors.green(assetSymbol)} from ${colors.cyan(selectedAddress)}:\n`,
  );

  renderFlowTree(
    selectedAddress,
    level1,
    pruned1,
    level2,
    pruned2,
    tagMap,
    rootTotal,
    decimals,
    assetSymbol,
  );
};
