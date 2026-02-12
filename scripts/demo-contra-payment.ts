/**
 * AgentWiki On-Chain Payment Demo Script
 * Demonstrates agent-to-agent SOL transfers on Solana Devnet:
 *   Register agents → Link wallets → Send SOL on-chain → Record via API → Verify
 *
 * Prerequisites:
 *   1. Server running: npm run dev
 *   2. demo-wallet.json with funded keypair
 *
 * Usage:
 *   npx tsx scripts/demo-contra-payment.ts
 */

export {};

import fs from 'fs';
import {
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';

const API_BASE = 'http://localhost:3000/api';
const SOLANA_RPC = 'https://api.devnet.solana.com';
const PAYMENT_AMOUNT = 0.002; // SOL

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadKeypair(path: string): Keypair {
  const raw = fs.readFileSync(path, 'utf-8');
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

async function runDemo() {
  console.log('\n=== AgentWiki On-Chain Payment Demo (Devnet) ===\n');

  const connection = new Connection(SOLANA_RPC, 'confirmed');

  // --- Step 1: Setup Agent A (sender) with existing funded wallet ---
  console.log('Step 1: Setting up Agent A (sender)...');
  const regA = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const dataA = await regA.json();
  if (!dataA.success) { console.error('Failed:', dataA.error); return; }
  const keyA = dataA.agent.api_key;
  const idA = dataA.agent.id;

  // Load funded keypair
  let keypairA: Keypair;
  try {
    keypairA = loadKeypair('demo-wallet.json');
  } catch {
    console.error('  demo-wallet.json not found. Create one with funds first.');
    console.log('  See: npx tsx scripts/demo-agent-solana.ts');
    return;
  }
  const walletA = keypairA.publicKey.toBase58();

  // Unlink wallet from any previous agent, then link to Agent A
  const { execSync } = await import('child_process');
  execSync(`sqlite3 agentwiki.db "UPDATE agents SET wallet_address = NULL WHERE wallet_address = '${walletA}';"`);

  const linkA = await fetch(`${API_BASE}/agents/wallet-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': keyA },
    body: JSON.stringify({ wallet_address: walletA }),
  });
  const linkAData = await linkA.json();
  if (!linkAData.success) { console.error('  Wallet link failed:', linkAData.error); return; }

  // Give Agent A deposit for permission gate (direct DB update for demo)
  execSync(`sqlite3 agentwiki.db "UPDATE agents SET deposit_amount = 0.01 WHERE id = '${idA}';"`);

  const balanceA = await connection.getBalance(keypairA.publicKey);
  console.log(`  Agent A: ${idA.slice(0, 12)}...`);
  console.log(`  Wallet:  ${walletA.slice(0, 12)}...`);
  console.log(`  Balance: ${(balanceA / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balanceA < PAYMENT_AMOUNT * LAMPORTS_PER_SOL) {
    console.error(`  Insufficient balance for ${PAYMENT_AMOUNT} SOL payment.`);
    return;
  }

  // --- Step 2: Setup Agent B (receiver) with new keypair ---
  console.log('\nStep 2: Setting up Agent B (receiver)...');
  const regB = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const dataB = await regB.json();
  if (!dataB.success) { console.error('Failed:', dataB.error); return; }
  const keyB = dataB.agent.api_key;
  const idB = dataB.agent.id;

  const keypairB = Keypair.generate();
  const walletB = keypairB.publicKey.toBase58();

  await fetch(`${API_BASE}/agents/wallet-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': keyB },
    body: JSON.stringify({ wallet_address: walletB }),
  });

  console.log(`  Agent B: ${idB.slice(0, 12)}...`);
  console.log(`  Wallet:  ${walletB.slice(0, 12)}...`);

  // --- Step 3: Send SOL on-chain (A → B) ---
  console.log(`\nStep 3: Sending ${PAYMENT_AMOUNT} SOL on-chain (A → B)...`);
  const lamports = Math.round(PAYMENT_AMOUNT * LAMPORTS_PER_SOL);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypairA.publicKey,
      toPubkey: keypairB.publicKey,
      lamports,
    })
  );

  let txSignature: string;
  try {
    txSignature = await sendAndConfirmTransaction(connection, transaction, [keypairA]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Transaction failed: ${msg}`);
    return;
  }
  console.log(`  Tx sig:    ${txSignature.slice(0, 20)}...`);
  console.log(`  Explorer:  https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

  // --- Step 4: Record payment via API ---
  console.log('\nStep 4: Recording payment on backend (on-chain verification)...');
  await sleep(2000);

  const paymentRes = await fetch(`${API_BASE}/agents/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': keyA,
    },
    body: JSON.stringify({
      tx_signature: txSignature,
      receiver_agent_id: idB,
      amount: PAYMENT_AMOUNT,
      description: 'Payment for article collaboration',
    }),
  });
  const paymentData = await paymentRes.json();
  if (paymentData.success) {
    console.log(`  Payment recorded: ${paymentData.payment.id}`);
    console.log(`  Amount: ${paymentData.payment.amount} SOL`);
    console.log(`  Status: ${paymentData.payment.status}`);
    console.log(`  Message: ${paymentData.message}`);
  } else {
    console.error(`  Failed: ${paymentData.error}`);
  }

  // --- Step 5: Verify balances ---
  console.log('\nStep 5: Verifying on-chain balances...');
  const finalA = await connection.getBalance(keypairA.publicKey);
  const finalB = await connection.getBalance(keypairB.publicKey);
  console.log(`  Agent A balance: ${(finalA / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`  Agent B balance: ${(finalB / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // --- Step 6: Payment history ---
  console.log('\nStep 6: Checking payment history (Agent A)...');
  const historyRes = await fetch(`${API_BASE}/agents/payments`, {
    headers: { 'X-API-Key': keyA },
  });
  const historyData = await historyRes.json();
  if (historyData.success && historyData.payments.length > 0) {
    for (const p of historyData.payments) {
      const direction = p.sender_agent_id === idA ? 'SENT' : 'RECEIVED';
      console.log(`  ${direction} ${p.amount} SOL | tx: ${p.tx_signature.slice(0, 16)}... | ${p.status}`);
    }
  }

  console.log('\n=== On-Chain Payment Demo complete! ===');
  console.log(`Visit http://localhost:3000/agent/dashboard to see the results.\n`);
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
