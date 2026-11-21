import {
  createPublicClient, createWalletClient, custom, defineChain, erc20Abi,
  formatUnits, http, keccak256, parseAbi, parseUnits,
  type Address, type EIP1193Provider, type Hash, type Hex,
} from 'viem';
import {
  ArlV5PoolClient, arlV5FactoryAbi, giwaSepoliaArlV5NativeRouter, normalizeArlV5Deployment,
} from '@ammora-protocol/sdk';
import './style.css';

const TAMM = '0x10B3Cc2fc981277Ada576891CF649D0ABA768B06';
const WETH = '0x4200000000000000000000000000000000000006';
const POOL = '0x1ef92a6a9bb4bbed2b385dd5e688f88e7965bcf8';
const FACTORY = '0xC0Fc168DeD39DA53C11D5082D9303216C3c37375';
const RPC = 'https://sepolia-rpc.giwa.io';
const EXPLORER = 'https://sepolia-explorer.giwa.io';
const giwa = defineChain({
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
  blockExplorers: { default: { name: 'GIWA Explorer', url: EXPLORER } },
});
const chainIdHex = `0x${giwa.id.toString(16)}` as const;
const pub = createPublicClient({ chain: giwa, transport: http(RPC) });
const tickerAbi = parseAbi(['function quoteExactIn(address tokenIn, uint256 amountIn) view returns (uint256)']);
const noWallet = 'No EIP-1193 wallet found — open this page in a wallet browser (e.g. Rabby/MetaMask).';
const injected = () => (window as Window & { ethereum?: EIP1193Provider }).ethereum;

async function buildPoolClient() {
  const read = (functionName: string) => pub.readContract({
    address: FACTORY, abi: arlV5FactoryAbi, functionName: functionName as any,
  }) as Promise<Address>;
  const [implementation, controller, vault, tokenPolicy, feePolicy] = await Promise.all([
    read('poolImplementation'), read('feeController'), read('feeVault'),
    read('tokenPolicyRegistry'), read('feePolicy'),
  ]);
  const roles = { factory: FACTORY, implementation, controller, vault, tokenPolicy, feePolicy };
  const contracts = Object.fromEntries(await Promise.all(Object.entries(roles).map(async ([role, address]) => {
    const code = await pub.getCode({ address });
    if (!code || code === '0x') throw new Error(`No bytecode found for ${role}.`);
    return [role, { address, runtimeCodeHash: keccak256(code), startBlock: 0n }];
  })));
  const deployment = normalizeArlV5Deployment({
    schemaVersion: 1, abiVersion: 'arl-public-v5.1', chainId: giwa.id,
    revision: 'ichika-fdn-dex-1', contracts,
    capabilities: {
      version: 1, revision: 'ichika-fdn-dex-1', mode: 'active',
      actions: ['create', 'swap', 'addLiquidity', 'removeLiquidity', 'claim', 'lock', 'split', 'merge', 'transferNFT', 'manageFees', 'registerToken'],
      reason: 'Ichika FDN DEX builder demo',
    },
  } as any);
  return new ArlV5PoolClient(pub, deployment, POOL);
}

let poolClient: Promise<ArlV5PoolClient> | undefined;
type Direction = 'buy' | 'sell';

async function planSwap(caller: Address, direction: Direction, amount: bigint, deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)) {
  poolClient ??= buildPoolClient().catch((error) => {
    poolClient = undefined;
    throw error;
  });
  return (await poolClient).planNativeSwapExactIn({
    caller, recipient: caller, asset: direction === 'buy' ? 'native-in' : 'native-out',
    amount, slippageBps: 100, deadline,
  }, giwaSepoliaArlV5NativeRouter);
}

document.querySelector('#app')!.innerHTML = `
  <header class="site-header">
    <div class="identity">
      <span class="mark" aria-hidden="true">⇄</span>
      <div><strong>Ichika FDN DEX</strong><span class="sdk">Built with the Ammora SDK</span></div>
    </div>
    <div class="header-actions">
      <span class="network">GIWA Sepolia · Testnet</span>
      <button id="connect" class="secondary" type="button">Connect Wallet</button>
    </div>
  </header>
  <main>
    <section class="card pool" aria-labelledby="pool-title">
      <div class="pool-heading">
        <h2 id="pool-title">tAMM / WETH pool</h2>
        <a class="pool-address" href="${EXPLORER}/address/${POOL}" target="_blank" rel="noopener noreferrer">${POOL}</a>
      </div>
      <p id="price" class="price">Loading pool price…</p>
      <dl class="reserves">
        <div><dt>Pool tAMM</dt><dd id="pool-tamm">—</dd></div>
        <div><dt>Pool WETH</dt><dd id="pool-weth">—</dd></div>
      </dl>
    </section>
    <section class="card swap" aria-labelledby="swap-title">
      <h1 id="swap-title">Swap</h1>
      <div class="directions" role="group" aria-label="Swap direction">
        <button id="buy" type="button" aria-pressed="true">Buy tAMM</button>
        <button id="sell" type="button" aria-pressed="false">Sell tAMM</button>
      </div>
      <form id="swap-form">
        <div class="amount-box">
          <label for="amount">You pay</label>
          <div class="amount-row">
            <input id="amount" type="text" inputmode="decimal" placeholder="0.0" autocomplete="off" maxlength="80" aria-describedby="input-token">
            <button id="max" type="button" hidden>MAX</button>
            <strong id="input-token">ETH</strong>
          </div>
        </div>
        <p id="balances" class="balances" hidden></p>
        <div class="quote" aria-live="polite">
          <p id="receive">Connect wallet to get a live SDK quote</p>
          <div id="quote-details" hidden>
            <p id="minimum"></p>
            <p id="rate"></p>
          </div>
          <p>Slippage tolerance: 1%</p>
        </div>
        <button id="submit" class="primary" type="submit">Connect Wallet</button>
      </form>
      <p id="status" role="status" hidden></p>
      <ul id="transactions" aria-label="Transaction links" hidden></ul>
    </section>
  </main>
  <footer>Powered by @ammora-protocol/sdk v0.3.10 · ARL v5 pool 0x1ef9…bcf8 · GIWA Sepolia testnet — testnet assets have no real value.</footer>
`;

function el<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}

const amountInput = el<HTMLInputElement>('amount');
const connectButton = el<HTMLButtonElement>('connect');
const submitButton = el<HTMLButtonElement>('submit');
const buyButton = el<HTMLButtonElement>('buy');
const sellButton = el<HTMLButtonElement>('sell');
const maxButton = el<HTMLButtonElement>('max');
const txList = el('transactions');
let direction: Direction = 'buy';
let account: Address | undefined;
let walletAuthorized = false;
let correctChain = false;
let connecting = false;
let swapping = false;
let quoting = false;
let quoteReady = false;
let quoteVersion = 0;
let quoteTimer: number | undefined;
let balanceVersion = 0;
let tammBalance: bigint | undefined;

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function display(raw: bigint, decimals: number) {
  const exact = formatUnits(raw, decimals);
  const [whole, fraction = ''] = exact.split('.');
  if (fraction.length <= 8) return exact;
  const trimmed = fraction.slice(0, 8).replace(/0+$/, '');
  if (whole === '0' && !trimmed) return exact;
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function tokenDecimals(value: Direction) {
  return value === 'buy' ? 18 : 6;
}

function parseAmount() {
  const text = amountInput.value.trim();
  const decimals = tokenDecimals(direction);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) || (text.split('.')[1]?.length ?? 0) > decimals) return;
  const amount = parseUnits(text, decimals);
  if (amount > 0n && amount < 2n ** 256n) return amount;
}

function errorCode(error: unknown, code: number) {
  let current = error as any;
  const seen = new Set();
  while (current && !seen.has(current)) {
    if (current.code === code) return true;
    seen.add(current);
    current = current.cause ?? current.data?.originalError;
  }
  return false;
}

function errorMessage(error: unknown) {
  if (errorCode(error, 4001)) return 'Transaction rejected in wallet.';
  return (error as { message?: string })?.message || String(error);
}

function setStatus(message: string, error = false) {
  const status = el('status');
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle('error', error);
}

function renderControls() {
  const locked = connecting || swapping;
  connectButton.textContent = connecting ? 'Connecting…' : account ? shorten(account) : 'Connect Wallet';
  connectButton.disabled = locked;
  buyButton.disabled = sellButton.disabled = amountInput.disabled = locked;
  buyButton.setAttribute('aria-pressed', String(direction === 'buy'));
  sellButton.setAttribute('aria-pressed', String(direction === 'sell'));
  el('input-token').textContent = direction === 'buy' ? 'ETH' : 'tAMM';
  maxButton.hidden = direction === 'buy';
  maxButton.disabled = locked || tammBalance === undefined;
  const amount = parseAmount();
  submitButton.textContent = swapping ? 'Swapping…'
    : connecting ? 'Connecting…'
    : !account ? 'Connect Wallet'
    : !correctChain ? 'Switch to GIWA Sepolia'
    : !amount ? 'Enter amount'
    : quoting ? 'Quoting…'
    : quoteReady ? 'Swap' : 'Retry quote';
  submitButton.disabled = locked || (!!account && correctChain && (!amount || quoting));
}

function scheduleQuote() {
  window.clearTimeout(quoteTimer);
  const version = ++quoteVersion;
  const caller = account;
  const trade = direction;
  const amount = parseAmount();
  const receive = el('receive');
  const details = el('quote-details');
  details.hidden = true;
  receive.classList.remove('error');
  quoteReady = false;
  quoting = Boolean(caller && correctChain && amount && !swapping);
  receive.textContent = !caller ? 'Connect wallet to get a live SDK quote'
    : !correctChain ? 'Switch to GIWA Sepolia to get a live SDK quote'
    : quoting ? 'Quoting…'
    : amountInput.value.trim() && !amount ? `Enter a positive amount with up to ${tokenDecimals(trade)} decimal places.`
    : 'Enter an amount to get a live SDK quote';
  renderControls();
  if (!quoting || !caller || !amount) return;

  quoteTimer = window.setTimeout(async () => {
    try {
      const plan = await planSwap(caller, trade, amount);
      if (version !== quoteVersion) return;
      const inDecimals = tokenDecimals(trade);
      const outDecimals = trade === 'buy' ? 6 : 18;
      const [input, output] = trade === 'buy' ? ['ETH', 'tAMM'] : ['tAMM', 'ETH'];
      const perUnit = plan.quotedAmount * 10n ** BigInt(inDecimals + 18) / amount;
      receive.textContent = `You receive ≈ ${display(plan.quotedAmount, outDecimals)} ${output}`;
      el('minimum').textContent = `Minimum received: ${formatUnits(plan.limit, outDecimals)} ${output}`;
      el('rate').textContent = `Rate: 1 ${input} ≈ ${display(perUnit, outDecimals + 18)} ${output}`;
      details.hidden = false;
      quoteReady = true;
    } catch (error) {
      if (version !== quoteVersion) return;
      receive.textContent = errorMessage(error);
      receive.classList.add('error');
    } finally {
      if (version === quoteVersion) {
        quoting = false;
        renderControls();
      }
    }
  }, 400);
}

function tokenBalance(token: Address, owner: Address) {
  return pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
}

async function refreshPool() {
  const [tamm, weth, price] = await Promise.allSettled([
    tokenBalance(TAMM, POOL),
    tokenBalance(WETH, POOL),
    pub.readContract({ address: POOL, abi: tickerAbi, functionName: 'quoteExactIn', args: [WETH, parseUnits('1', 18)] }),
  ]);
  el('pool-tamm').textContent = tamm.status === 'fulfilled' ? display(tamm.value, 6) : 'Unavailable';
  el('pool-weth').textContent = weth.status === 'fulfilled' ? display(weth.value, 18) : 'Unavailable';
  el('price').textContent = price.status === 'fulfilled' ? `1 ETH ≈ ${display(price.value, 6)} tAMM` : 'Pool price unavailable';
}

async function refreshBalances() {
  const version = ++balanceVersion;
  const owner = account;
  const balances = el('balances');
  tammBalance = undefined;
  balances.hidden = !owner;
  balances.textContent = owner ? 'Loading wallet balances…' : '';
  renderControls();
  if (!owner) return;
  const [eth, tamm] = await Promise.allSettled([pub.getBalance({ address: owner }), tokenBalance(TAMM, owner)]);
  if (version !== balanceVersion) return;
  tammBalance = tamm.status === 'fulfilled' ? tamm.value : undefined;
  balances.textContent = `Wallet: ${eth.status === 'fulfilled' ? display(eth.value, 18) : '—'} ETH · ${tammBalance === undefined ? '—' : display(tammBalance, 6)} tAMM`;
  renderControls();
}

function isGiwa(chain: string) {
  return Number(chain) === giwa.id;
}

async function ensureChain(provider: EIP1193Provider) {
  if (isGiwa(await provider.request({ method: 'eth_chainId' }))) return;
  const switchChain = () => provider.request({
    method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }],
  });
  try {
    await switchChain();
  } catch (error) {
    if (!errorCode(error, 4902)) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex, chainName: giwa.name, nativeCurrency: giwa.nativeCurrency,
        rpcUrls: [RPC], blockExplorerUrls: [EXPLORER],
      }],
    });
    if (!isGiwa(await provider.request({ method: 'eth_chainId' }))) await switchChain();
  }
}

async function connectWallet() {
  const provider = injected();
  if (!provider) {
    setStatus(noWallet, true);
    return;
  }
  connecting = true;
  renderControls();
  setStatus('Connecting wallet…');
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts[0]) throw new Error('No account was returned by the wallet.');
    walletAuthorized = true;
    account = accounts[0];
    correctChain = false;
    await ensureChain(provider);
    const [activeAccounts, chain] = await Promise.all([
      provider.request({ method: 'eth_accounts' }),
      provider.request({ method: 'eth_chainId' }),
    ]);
    account = activeAccounts[0];
    correctChain = isGiwa(chain);
    if (!account) throw new Error('No active wallet account.');
    if (!correctChain) throw new Error('Switch your wallet to GIWA Sepolia.');
    setStatus('');
  } catch (error) {
    setStatus(errorMessage(error), true);
  } finally {
    connecting = false;
    void refreshBalances();
    scheduleQuote();
  }
}

function addTransaction(label: string, hash: Hash) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = `${EXPLORER}/tx/${hash}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `${label} · ${shorten(hash)} ↗`;
  item.append(link);
  txList.append(item);
  txList.hidden = false;
}

async function executeSwap() {
  const caller = account;
  const amount = parseAmount();
  const provider = injected();
  if (!caller || !amount || !correctChain || !provider) return;
  const trade = direction;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  swapping = true;
  ++quoteVersion;
  txList.replaceChildren();
  txList.hidden = true;
  renderControls();
  const wallet = createWalletClient({ chain: giwa, transport: custom(provider) });

  async function send(label: string, tx: { to: Address; data: Hex; value: bigint }) {
    const [activeAccounts, chain] = await Promise.all([
      provider!.request({ method: 'eth_accounts' }),
      provider!.request({ method: 'eth_chainId' }),
    ]);
    if (!isGiwa(chain) || activeAccounts[0]?.toLowerCase() !== caller!.toLowerCase()) {
      throw new Error('Wallet account or network changed. Review the swap and try again.');
    }
    if (BigInt(Math.floor(Date.now() / 1000)) >= deadline) {
      throw new Error('The swap plan expired. Try again for a fresh plan.');
    }
    setStatus(`Confirm ${label.toLowerCase()} in wallet…`);
    const hash = await wallet.sendTransaction({ account: caller!, to: tx.to, data: tx.data, value: tx.value });
    addTransaction(label, hash);
    setStatus(`Waiting for ${label.toLowerCase()} confirmation…`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${label} reverted on-chain.`);
  }

  try {
    setStatus('Preparing a fresh SDK swap plan…');
    const plan = await planSwap(caller, trade, amount, deadline);
    if (plan.approval && plan.approval.currentAllowance < plan.approval.amount) {
      for (const [index, tx] of plan.approval.transactions.entries()) {
        await send(`Approval ${index + 1}`, tx);
      }
    }
    await send('Swap', plan.transaction);
    amountInput.value = '';
    setStatus('Swap confirmed.');
    void refreshPool();
  } catch (error) {
    setStatus(errorMessage(error), true);
  } finally {
    swapping = false;
    void refreshBalances();
    scheduleQuote();
  }
}

function setDirection(next: Direction) {
  if (next === direction) return;
  direction = next;
  amountInput.value = '';
  scheduleQuote();
}

connectButton.addEventListener('click', () => void connectWallet());
buyButton.addEventListener('click', () => setDirection('buy'));
sellButton.addEventListener('click', () => setDirection('sell'));
amountInput.addEventListener('input', scheduleQuote);
maxButton.addEventListener('click', () => {
  if (tammBalance === undefined) return;
  amountInput.value = formatUnits(tammBalance, 6);
  scheduleQuote();
});
el('swap-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (connecting || swapping || quoting) return;
  if (!account || !correctChain) void connectWallet();
  else if (quoteReady) void executeSwap();
  else scheduleQuote();
});

const provider = injected();
provider?.on?.('accountsChanged', (accounts) => {
  if (!walletAuthorized || connecting) return;
  account = accounts[0];
  void refreshBalances();
  scheduleQuote();
});
provider?.on?.('chainChanged', (chain) => {
  correctChain = isGiwa(chain);
  scheduleQuote();
});
if (!provider) setStatus(noWallet, true);
renderControls();
void refreshPool();
