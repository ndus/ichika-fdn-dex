# Ichika FDN DEX

Ichika FDN DEX is a Vite and TypeScript app for buying tAMM with native ETH or selling tAMM for native ETH on GIWA Sepolia. The pool holds tAMM and WETH. The native router handles wrapping and unwrapping.

Swap quotes, minimum outputs, approvals, and swap transactions come from `@ammora-protocol/sdk` v0.3.10 through `ArlV5PoolClient.planNativeSwapExactIn` and the `giwaSepoliaArlV5NativeRouter` binding. The app refreshes the plan before execution and sends those transactions through the injected EIP-1193 wallet. The pool panel independently reads token balances and the pool's quote for 1 WETH as a display ticker.

On the first swap quote, the app reads `poolImplementation`, `feeController`, `feeVault`, `tokenPolicyRegistry`, and `feePolicy` from the ARL v5 factory. It reads the runtime bytecode for those contracts and the factory, hashes it with Keccak-256, and passes the addresses and hashes to `normalizeArlV5Deployment`. The resulting pool client is cached for the page session.

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL in a browser with an injected wallet such as Rabby or MetaMask. Connect the wallet and fund it with GIWA Sepolia ETH for gas. Selling also requires tAMM.

Run `npm run build` to generate `dist/` and `npm run preview` to preview it locally.

## GIWA Sepolia deployment

| Item | Value |
| --- | --- |
| Chain ID | 91342 |
| Native currency | ETH (18 decimals) |
| RPC | https://sepolia-rpc.giwa.io |
| Explorer | https://sepolia-explorer.giwa.io |
| tAMM (6 decimals) | `0x10B3Cc2fc981277Ada576891CF649D0ABA768B06` |
| WETH (18 decimals) | `0x4200000000000000000000000000000000000006` |
| ARL v5 pool | `0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8` |
| ARL v5 factory | `0xC0Fc168DeD39DA53C11D5082D9303216C3c37375` |
| Native router | `0x4FC91b90087288520A7bB4aA7Ab5441bb4E9C496` |

Testnet assets have no real value.
