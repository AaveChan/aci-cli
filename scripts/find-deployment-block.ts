/**
 * Binary-search the block at which a contract was first deployed.
 *
 * Uses eth_getCode via raw JSON-RPC to avoid viem Chain type constraints,
 * making it work with any chain (including custom ones like MegaETH).
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/find-deployment-block.ts \
 *     <contractAddress> <rpcUrl>
 */

const ethGetCode = async (
  rpcUrl: string,
  address: string,
  blockNumber: bigint,
): Promise<boolean> => {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, `0x${blockNumber.toString(16)}`],
    }),
  });
  const json = (await res.json()) as { result: string };
  return json.result !== "0x" && json.result !== "0x0" && json.result !== "";
};

const ethBlockNumber = async (rpcUrl: string): Promise<bigint> => {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
  });
  const json = (await res.json()) as { result: string };
  return BigInt(json.result);
};

const findDeploymentBlock = async (
  contractAddress: string,
  rpcUrl: string,
): Promise<bigint> => {
  const currentBlock = await ethBlockNumber(rpcUrl);
  console.log(`Current block: ${currentBlock}`);

  const existsNow = await ethGetCode(rpcUrl, contractAddress, currentBlock);
  if (!existsNow) {
    throw new Error(
      `Contract ${contractAddress} has no code at block ${currentBlock}. Wrong address or chain?`,
    );
  }

  let lo = 0n;
  let hi = currentBlock;

  console.log(`Binary searching [0, ${hi}]...\n`);

  let iteration = 0;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    iteration++;

    const exists = await ethGetCode(rpcUrl, contractAddress, mid);
    const pct = ((Number(mid) / Number(currentBlock)) * 100).toFixed(1);
    process.stdout.write(
      `  [${String(iteration).padStart(2)}] block ${mid} (${pct}%) → ${exists ? "deployed ✓" : "not yet  ✗"}\n`,
    );

    if (exists) {
      hi = mid;
    } else {
      lo = mid + 1n;
    }
  }

  return lo;
};

const main = async () => {
  const [, , contractAddress, rpcUrl] = process.argv;

  if (!contractAddress || !rpcUrl) {
    console.error(
      "Usage: ts-node scripts/find-deployment-block.ts <contractAddress> <rpcUrl>",
    );
    process.exit(1);
  }

  console.log(`\nFinding deployment block for ${contractAddress}`);
  console.log(`RPC: ${rpcUrl}\n`);

  const deploymentBlock = await findDeploymentBlock(contractAddress, rpcUrl);

  console.log(`\n✓ Deployment block: ${deploymentBlock}`);
  console.log(`  Add to markets.ts as: deploymentBlock: ${deploymentBlock}n`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
