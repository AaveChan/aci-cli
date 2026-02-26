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
import {
  resolveAddressTag,
  AddressTag,
  getATokenLabel,
} from "@/lib/address-tags";

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

const formatTags = (tag: AddressTag, maskAsset?: string): string => {
  if (tag.aTokenLabel) return `  [${colors.yellow(tag.aTokenLabel)}]`;
  const parts: string[] = [];
  if (tag.ens) parts.push(colors.cyan(`ENS: ${tag.ens}`));
  const supplying = maskAsset
    ? tag.aaveSupplying?.filter((s) => s === maskAsset)
    : tag.aaveSupplying;
  const borrowing = maskAsset
    ? tag.aaveBorrowing?.filter((s) => s === maskAsset)
    : tag.aaveBorrowing;
  if (supplying?.length || borrowing?.length) {
    const supply = supplying?.map((s) => `a${s}`).join(", ") ?? "";
    const borrow = borrowing?.map((s) => `v${s}`).join(", ") ?? "";
    const aaveStr =
      supply && borrow
        ? `${supply} | ${borrow}`
        : supply
          ? supply
          : `| ${borrow}`;
    parts.push(colors.yellow(`Aave: ${aaveStr}`));
  } else if (tag.isContract) parts.push(colors.gray("Contract"));
  return parts.length > 0 ? `  [${parts.join("] [")}]` : "";
};

type PrunedSummary = { count: number; amount: bigint };

const renderFlowTree = (
  root: Address,
  level1: [Address, bigint][],
  pruned1: PrunedSummary,
  level2: Map<Address, [Address, bigint][]>,
  pruned2: Map<Address, PrunedSummary>,
  tagMap: Map<Address, AddressTag>,
  rootTotal: bigint,
  decimals: number,
  assetSymbol: string,
  maskUnrelated: boolean,
) => {
  const maskAsset = maskUnrelated ? assetSymbol : undefined;
  const pct = (amount: bigint) =>
    rootTotal > 0n
      ? `${((Number(amount) * 100) / Number(rootTotal)).toFixed(1)}%`
      : "0.0%";

  const prunedLabel = ({ count, amount }: PrunedSummary) =>
    `[${count} recipient${count > 1 ? "s" : ""} pruned (${pct(amount)})]`;

  const selfLabel = (addr: Address) =>
    addr.toLowerCase() === root.toLowerCase()
      ? `  ${colors.white("[↩ self]")}`
      : "";

  const rootTag = tagMap.get(root);
  console.log(
    `\n${colors.cyan(shortAddr(root))}${rootTag ? formatTags(rootTag) : ""}  [total out: ${formatUnits(rootTotal, decimals)} ${assetSymbol}]`,
  );

  for (let i = 0; i < level1.length; i++) {
    const isLastL1 = i === level1.length - 1 && pruned1.count === 0;
    const [addr, amount] = level1[i];
    const tag = tagMap.get(addr);
    const prefix1 = isLastL1 ? "└── " : "├── ";
    const cont1 = isLastL1 ? "    " : "│   ";

    console.log(
      `${prefix1} ${selfLabel(addr)} ${colors.green(shortAddr(addr))}  ${formatUnits(amount, decimals)} ${assetSymbol}  (${pct(amount)})${tag ? formatTags(tag, maskAsset) : ""}`,
    );

    // aToken addresses are terminal — no sub-leaves
    if (tag?.aTokenLabel) continue;

    const children = level2.get(addr) ?? [];
    const childPruned = pruned2.get(addr) ?? { count: 0, amount: 0n };

    for (let j = 0; j < children.length; j++) {
      const isLastL2 = j === children.length - 1 && childPruned.count === 0;
      const [subAddr, subAmount] = children[j];
      const subTag = tagMap.get(subAddr);
      const prefix2 = isLastL2 ? "└── " : "├── ";

      console.log(
        `${cont1}${prefix2} ${selfLabel(subAddr)} ${colors.green(shortAddr(subAddr))}  ${formatUnits(subAmount, decimals)} ${assetSymbol}  (${pct(subAmount)})${subTag ? formatTags(subTag, maskAsset) : ""}`,
      );
    }

    if (childPruned.count > 0) {
      console.log(`${cont1}└── ${colors.gray(prunedLabel(childPruned))}`);
    }
  }

  if (pruned1.count > 0) {
    console.log(`└── ${colors.gray(prunedLabel(pruned1))}`);
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
  const pruned1Items = allSorted.filter(([, v]) => v < threshold);
  const pruned1 = {
    count: pruned1Items.length,
    amount: pruned1Items.reduce((s, [, v]) => s + v, 0n),
  };

  // Step 5: fetch level-2 outflows — skip aToken recipients (they are terminal)
  const nonATokenLevel1 = level1.filter(
    ([addr]) => getATokenLabel(addr, market.chain) === undefined,
  );

  console.log(
    `\nFetching depth-2 outflows for ${nonATokenLevel1.length} recipients...\n`,
  );

  const level2: Map<Address, [Address, bigint][]> = new Map();
  const pruned2: Map<Address, PrunedSummary> = new Map();

  await Promise.all(
    nonATokenLevel1.map(async ([recipient]) => {
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
      const prunedSubItems = subAllSorted.filter(([, v]) => v < threshold);
      pruned2.set(recipient, {
        count: prunedSubItems.length,
        amount: prunedSubItems.reduce((s, [, v]) => s + v, 0n),
      });
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
    maskUnrelated,
  );
};
