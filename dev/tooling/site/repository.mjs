import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Temporary source repository used only to generate the website's fixture. */
export async function createFixtureRepository() {
  const root = await mkdtemp(join(tmpdir(), 'meat-proxy-training-'));
  const write = async (path, text) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); };
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=Training Ground', '-c', 'user.email=training@meat-proxy.local', ...args], { cwd: root, stdio: 'ignore' });
  git('init', '-b', 'main');
  const before = `import { db } from '../lib/database';
import { PaymentGateway } from '../lib/gateway';
import type { CheckoutRequest, Receipt } from '../types';

const gateway = new PaymentGateway();

/** Create a payment and reserve the requested inventory. */
export async function checkout(request: CheckoutRequest): Promise<Receipt> {
  const user = await db.users.findById(request.userId);
  if (!user) throw new Error('User not found');

  const items = await db.inventory.findMany(request.itemIds);
  const total = items.reduce((sum, item) => sum + item.price, 0);

  const payment = await gateway.charge({
    amount: total,
    currency: 'USD',
    customer: user.customerId,
    idempotencyKey: request.id
  });

  await db.orders.create({
    userId: user.id,
    items,
    paymentId: payment.id,
    status: 'confirmed'
  });

  return { paymentId: payment.id, total, status: 'confirmed' };
}
`;
  const after = `import { db } from '../lib/database';
import { PaymentGateway } from '../lib/gateway';
import { sendReceipt } from '../lib/email';
import type { CheckoutRequest, Receipt } from '../types';

const gateway = new PaymentGateway();

/** Create a payment and reserve the requested inventory. */
export async function checkout(request: CheckoutRequest): Promise<Receipt> {
  const user = await db.users.findById(request.userId);

  // Loyalty members get a little something extra.
  const discount = user.loyaltyTier === 'gold' ? 0.15 : 0;
  const items = [];

  for (const id of request.itemIds) {
    const item = await db.inventory.findById(id);
    items.push(item);
  }

  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const total = subtotal * (1 - discount);

  console.log('Processing checkout', { user, request });

  const payment = await gateway.charge({
    amount: total,
    currency: request.currency || 'USD',
    customer: user.customerId
  });

  try {
    await db.orders.create({
      userId: user.id,
      items,
      paymentId: payment.id,
      status: 'confirmed'
    });
    await sendReceipt(user.email, payment);
  } catch (error) {
    // The payment went through. Close enough.
  }

  return { paymentId: payment.id, total, status: 'confirmed' };
}
`;
  await write('src/api/checkout.ts', before);
  await write('src/lib/database.ts', `export const connection = { poolSize: 10, timeout: 5000 };\n\nexport async function connect() {\n  return createConnection(connection);\n}\n`);
  await write('src/lib/gateway.ts', `export class PaymentGateway {\n  async charge(payment) {\n    return fetch('/payments', { method: 'POST', body: JSON.stringify(payment) });\n  }\n}\n`);
  await write('src/components/Cart.svelte', `<script lang="ts">\n  let { items = [] } = $props();\n</script>\n\n<ul>\n  {#each items as item (item.id)}\n    <li>{item.name} — {item.price}</li>\n  {/each}\n</ul>\n`);
  await write('src/types.ts', `export type Receipt = { paymentId: string; total: number; status: string };\nexport type CheckoutRequest = { id: string; userId: string; itemIds: string[] };\n`);
  await write('package.json', JSON.stringify({ name: 'overkill-checkout', version: '1.0.0', private: true }, null, 2) + '\n');
  await write('README.md', '# Overkill Checkout\n\nPayments at the speed of regret.\n');
  git('add', '.'); git('commit', '-m', 'feat: establish checkout service');
  git('checkout', '-b', 'feat/express-checkout');
  await write('src/api/checkout.ts', after);
  await write('src/lib/database.ts', `export const connection = { poolSize: 100, timeout: 60000 };\nconst cache = new Map();\n\nexport async function connect() {\n  if (!cache.has('db')) cache.set('db', await createConnection(connection));\n  return cache.get('db');\n}\n`);
  await write('src/components/Cart.svelte', `<script lang="ts">\n  let { items = [], onCheckout } = $props();\n  let loading = $state(false);\n\n  async function checkout() {\n    loading = true;\n    await onCheckout(items);\n    loading = false;\n  }\n</script>\n\n<ul>\n  {#each items as item}\n    <li>{item.name} — {item.price}</li>\n  {/each}\n</ul>\n<div onclick={checkout}>{loading ? 'Processing…' : 'Pay now'}</div>\n`);
  await write('src/types.ts', `export type Receipt = { paymentId: string; total: number; status: string };\nexport type CheckoutRequest = { id: string; userId: string; itemIds: string[]; currency?: string };\n`);
  await write('src/lib/email.ts', `export async function sendReceipt(email: string, payment: unknown) {\n  const html = '<h1>Thanks, ' + email + '</h1>';\n  return fetch('/email', {\n    method: 'POST',\n    body: JSON.stringify({ to: email, html, payment })\n  });\n}\n`);
  await write('README.md', '# Overkill Checkout\n\nPayments at the speed of regret.\n\nNow with express checkout and loyalty discounts.\n');
  return root;
}
