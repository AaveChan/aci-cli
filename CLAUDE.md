# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Node.js/TypeScript CLI tool for querying Ethereum/EVM blockchain data using [Viem](https://viem.sh/). ACI uses it to manage on-chain tasks: fetching ETH balances, computing ERC-20 token holder snapshots, and exploring Aave user positions.

## Setup

```bash
bun i
cp .example.env .env
# Set RPC_MAINNET and any chain-specific RPC vars in .env
# Chain RPC vars: RPC_MAINNET, RPC_POLYGON, RPC_ARBITRUM, RPC_OPTIMISM, RPC_AVALANCHE,
#   RPC_BASE, RPC_BNB, RPC_GNOSIS, RPC_SCROLL, RPC_METIS, RPC_ZKSYNC, RPC_LINEA, RPC_CELO
```

## Commands

```bash
# Run tests
bun run test

# Run a single test file
bun run jest src/lib/utils/utils.test.ts

# Run a single test by name
bun run jest -t "test name here"

# CLI commands
bun run get-balance <address> [-b blockNumber]
bun run get-token-holders <tokenAddress> <tokenName> <deploymentBlock> [-b blockNumber] [-p]
bun run explore-aave-users [market] [asset] [tokenType] [-b blockNumber] [-n top] [-p]
```

## Architecture

**Entry point**: `src/cli/cli.ts` → `src/cli/program.ts` (Commander commands) → `src/actions/` (handlers) → `src/lib/` (core logic)

**Key modules**:

- `src/clients/viem.ts` — Viem public + wallet client setup; reads `RPC_URL_ETH` from env. Also exports `createPublicClientForChain(chain, rpcUrl?)` for multi-chain use.
- `src/lib/aave/markets.ts` — All production Aave V2/V3 markets with chain config, deployment block, and RPC env var name. Each market's `.market.ASSETS[symbol]` has `A_TOKEN`, `V_TOKEN`, and `decimals`.
- `src/lib/token-holders/token-holders.ts` — Core token holder logic. Computes balances by replaying ERC-20 Transfer events rather than querying final state. Key functions: `fetchEvents` (batched RPC calls), `getEvents` (with local cache), `computeHoldersBalances` (balance calculation from event history).
- `src/lib/file-storing.ts` — Caches fetched Transfer events locally under `./cache/erc-20/` as JSON files to avoid re-fetching.
- `src/lib/json-bigint.ts` — Custom JSON `replacer`/`reviver` that serializes BigInt as `{ $bigint: "..." }`. Required because token amounts exceed JavaScript's safe integer range.
- `src/lib/utils/utils.ts` — `retryRequest` (3 retries, 600ms apart), `fetchInBatches` (parallel batch processing), `mergeMap`.

**Path alias**: `@/` maps to `./src/` (configured in `tsconfig.json` and `jest.config.ts`).

**TypeScript config**: strict mode, ES2020 target, CommonJS modules.
