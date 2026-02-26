import { getBalanceAction } from "@/actions/get-balance";
import { getTokenHoldersAction } from "@/actions/get-token-holders";
import {
  exploreAaveUsersAction,
  SupplyType,
  BorrowType,
} from "@/actions/explore-aave-users";
import { traceBorrowerOutflowsAction } from "@/actions/trace-borrower-outflows";
import { traceAllBorrowersAction } from "@/actions/trace-all-borrowers";
import { Command } from "commander";

// ── Reusable option helpers ────────────────────────────────────────────────
const withNoInteractive = (cmd: Command) =>
  cmd.option(
    "--no-interactive",
    "Disable interactive prompts — all arguments must be provided or the command fails",
  );

const withBlockNumber = (
  cmd: Command,
  description = "The block number snapshot to use",
) => cmd.option("-b, --blockNumber [block_number]", description);

const withTop = (cmd: Command, description: string) =>
  cmd.option("-n, --top <number>", description, "10");

const withProgressBar = (cmd: Command, description: string) =>
  cmd.option("-p, --progressBar", description, false);

const withMaskUnrelated = (cmd: Command) =>
  cmd.option(
    "-m, --maskUnrelated",
    "Hide Aave positions unrelated to the traced asset in address tags",
    false,
  );

// ── Commands ───────────────────────────────────────────────────────────────
const getBalanceCmd = new Command("get-balance");
getBalanceCmd.arguments("address");
withBlockNumber(
  getBalanceCmd,
  "The block number from which to get the balance",
);
getBalanceCmd.action(getBalanceAction);

const getTokenHoldersCmd = new Command("get-token-holders");
getTokenHoldersCmd.arguments("tokenAddress");
getTokenHoldersCmd.arguments("tokenName");
getTokenHoldersCmd.arguments("tokenDeploymentBlock");
withBlockNumber(
  getTokenHoldersCmd,
  "The block number from which to get the balance",
);
withProgressBar(
  getTokenHoldersCmd,
  "Display a progress bar while fetching the token holders",
);
getTokenHoldersCmd.action(getTokenHoldersAction);

const exploreAaveUsersCmd = new Command("explore-aave-users");
exploreAaveUsersCmd.argument(
  "[market]",
  "Aave market name (e.g. AaveV3Ethereum)",
);
exploreAaveUsersCmd.argument("[asset]", "Asset symbol (e.g. USDC)");
exploreAaveUsersCmd.argument(
  "[tokenType]",
  `Position type: "${SupplyType}" or "${BorrowType}"`,
);
withBlockNumber(exploreAaveUsersCmd);
withTop(exploreAaveUsersCmd, "Number of top holders to display");
withProgressBar(exploreAaveUsersCmd, "Display a progress bar while fetching");
withNoInteractive(exploreAaveUsersCmd);
exploreAaveUsersCmd.action(exploreAaveUsersAction);

const traceBorrowerOutflowsCmd = new Command("trace-borrower-outflows");
traceBorrowerOutflowsCmd.argument(
  "[market]",
  "Aave market name (e.g. AaveV3Ethereum)",
);
traceBorrowerOutflowsCmd.argument("[asset]", "Asset symbol (e.g. USDC)");
traceBorrowerOutflowsCmd.argument(
  "[address]",
  "Borrower address to trace outflows from",
);
withBlockNumber(traceBorrowerOutflowsCmd);
withTop(traceBorrowerOutflowsCmd, "Number of top recipients to display");
withProgressBar(
  traceBorrowerOutflowsCmd,
  "Display a progress bar while fetching borrowers",
);
withMaskUnrelated(traceBorrowerOutflowsCmd);
withNoInteractive(traceBorrowerOutflowsCmd);
traceBorrowerOutflowsCmd.action(traceBorrowerOutflowsAction);

const traceAllBorrowersCmd = new Command("trace-all-borrowers");
traceAllBorrowersCmd.argument(
  "[market]",
  "Aave market name (e.g. AaveV3Ethereum)",
);
traceAllBorrowersCmd.argument("[asset]", "Asset symbol (e.g. USDC)");
withBlockNumber(traceAllBorrowersCmd);
withTop(traceAllBorrowersCmd, "Number of top borrowers to trace");
withProgressBar(
  traceAllBorrowersCmd,
  "Display a progress bar while fetching borrowers",
);
withMaskUnrelated(traceAllBorrowersCmd);
withNoInteractive(traceAllBorrowersCmd);
traceAllBorrowersCmd.action(traceAllBorrowersAction);

export const program = new Command();
program.addCommand(getBalanceCmd);
program.addCommand(getTokenHoldersCmd);
program.addCommand(exploreAaveUsersCmd);
program.addCommand(traceBorrowerOutflowsCmd);
program.addCommand(traceAllBorrowersCmd);
