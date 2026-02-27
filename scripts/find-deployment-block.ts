/**
 * Binary-search the block at which a contract was first deployed.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/find-deployment-block.ts \
 *     <contractAddress> <rpcUrl>
 */

import { createPublicClient, http, getAddress } from "viem";
import type { Address } from "viem";

const findDeploymentBlock = async (
  contractAddress: Address,
  rpcUrl: string,
): Promise<bigint> => {
  const client = createPublicClient({ transport: http(rpcUrl) });

  const currentBlock = await client.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);

  const codeNow = await client.getBytecode({
    address: contractAddress,
    blockNumber: currentBlock,
  });
  if (!codeNow || codeNow === "0x") {
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

    const code = await client.getBytecode({
      address: contractAddress,
      blockNumber: mid,
    });
    const exists = !!code && code !== "0x";
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

  const deploymentBlock = await findDeploymentBlock(
    getAddress(contractAddress),
    rpcUrl,
  );

  console.log(`\n✓ Deployment block: ${deploymentBlock}`);
  console.log(`  Add to markets.ts as: deploymentBlock: ${deploymentBlock}n`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
