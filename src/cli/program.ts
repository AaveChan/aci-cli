import { getBalanceAction } from "@/actions/get-balance";
import { getTokenHoldersAction } from "@/actions/get-token-holders";
import { exploreAaveUsersAction } from "@/actions/explore-aave-users";
import { Command } from "commander";

const getBalanceCmd = new Command("get-balance");
getBalanceCmd.arguments("address");
getBalanceCmd.option(
  "-b, --blockNumber [block_number]",
  "The block number from which to get the balance"
);
getBalanceCmd.action(getBalanceAction);

const getTokenHoldersCmd = new Command("get-token-holders");
getTokenHoldersCmd.arguments("tokenAddress");
getTokenHoldersCmd.arguments("tokenName");
getTokenHoldersCmd.arguments("tokenDeploymentBlock");
getTokenHoldersCmd.option(
  "-b, --blockNumber [block_number]",
  "The block number from which to get the balance"
);
getTokenHoldersCmd.option(
  "-p, --progressBar",
  "Display a progress bar while fetching the token holders",
  false
);
getTokenHoldersCmd.action(getTokenHoldersAction);

const exploreAaveUsersCmd = new Command("explore-aave-users");
exploreAaveUsersCmd.argument("[market]", "Aave market name (e.g. AaveV3Ethereum)");
exploreAaveUsersCmd.argument("[asset]", "Asset symbol (e.g. USDC)");
exploreAaveUsersCmd.argument("[tokenType]", 'Position type: "supply" or "borrow"');
exploreAaveUsersCmd.option(
  "-b, --blockNumber [block_number]",
  "The block number snapshot to use"
);
exploreAaveUsersCmd.option(
  "-n, --top <number>",
  "Number of top holders to display",
  "10"
);
exploreAaveUsersCmd.option(
  "-p, --progressBar",
  "Display a progress bar while fetching",
  false
);
exploreAaveUsersCmd.option(
  "--no-interactive",
  "Disable interactive prompts — all arguments must be provided or the command fails"
);
exploreAaveUsersCmd.action(exploreAaveUsersAction);

export const program = new Command();
program.addCommand(getBalanceCmd);
program.addCommand(getTokenHoldersCmd);
program.addCommand(exploreAaveUsersCmd);
