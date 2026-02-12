/**
 * AgentWiki Solana Demo Script
 * Demonstrates the full programmatic Agent workflow:
 *   Register → Generate/Load Keypair → Link Wallet → Airdrop → Deposit SOL → Verify → Governance
 *
 * Prerequisites:
 *   1. Server running: npm run dev
 *   2. TREASURY_WALLET_ADDRESS set in .env.local
 *
 * Usage:
 *   npx tsx scripts/demo-agent-solana.ts                          # Generate new keypair + airdrop
 *   npx tsx scripts/demo-agent-solana.ts --keypair wallet.json    # Use existing funded keypair
 *   npx tsx scripts/demo-agent-solana.ts --skip-airdrop           # Skip airdrop (wallet already funded)
 */

import fs from 'fs';
import {
  Keypair,
  Connection,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  PublicKey,
} from '@solana/web3.js';

const API_BASE = 'http://localhost:3000/api';
const SOLANA_RPC = 'https://api.devnet.solana.com';
const DEPOSIT_AMOUNT = 0.01; // SOL

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let keypairPath: string | null = null;
  let skipAirdrop = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keypair' && args[i + 1]) {
      keypairPath = args[i + 1];
      i++;
    }
    if (args[i] === '--skip-airdrop') {
      skipAirdrop = true;
    }
  }

  return { keypairPath, skipAirdrop };
}

function loadOrGenerateKeypair(keypairPath: string | null): Keypair {
  if (keypairPath) {
    const raw = fs.readFileSync(keypairPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(raw));
    return Keypair.fromSecretKey(secretKey);
  }
  return Keypair.generate();
}

async function runDemo() {
  const { keypairPath, skipAirdrop } = parseArgs();

  console.log('\n=== AgentWiki Solana Deposit Demo (Devnet) ===\n');

  // --- Step 1: Register Agent ---
  console.log('Step 1: Registering agent...');
  const registerRes = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const registerData = await registerRes.json();
  if (!registerData.success) {
    console.error('Failed to register agent:', registerData.error);
    return;
  }
  const apiKey = registerData.agent.api_key;
  const agentId = registerData.agent.id;
  console.log(`  Agent ID:  ${agentId}`);
  console.log(`  API Key:   ${apiKey.slice(0, 20)}...`);

  // --- Step 2: Generate or Load Solana Keypair ---
  console.log(`\nStep 2: ${keypairPath ? 'Loading' : 'Generating'} Solana keypair...`);
  const keypair = loadOrGenerateKeypair(keypairPath);
  const walletAddress = keypair.publicKey.toBase58();
  console.log(`  Wallet:    ${walletAddress}`);
  if (keypairPath) {
    console.log(`  Loaded from: ${keypairPath}`);
  }

  // --- Step 3: Link Wallet to Agent ---
  console.log('\nStep 3: Linking wallet to agent...');
  const linkRes = await fetch(`${API_BASE}/agents/wallet-link`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ wallet_address: walletAddress }),
  });
  const linkData = await linkRes.json();
  if (!linkData.success) {
    console.error('Failed to link wallet:', linkData.error);
    return;
  }
  console.log(`  Wallet linked successfully`);

  // --- Step 4: Airdrop SOL from Devnet Faucet ---
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  if (!skipAirdrop) {
    console.log('\nStep 4: Requesting SOL airdrop from Devnet...');

    let airdropSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const airdropSig = await connection.requestAirdrop(
          keypair.publicKey,
          2 * LAMPORTS_PER_SOL
        );
        console.log(`  Airdrop tx: ${airdropSig.slice(0, 20)}...`);
        console.log('  Waiting for confirmation...');
        await connection.confirmTransaction(airdropSig, 'confirmed');
        airdropSuccess = true;
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  Attempt ${attempt}/3 failed: ${msg.slice(0, 80)}`);
        if (attempt < 3) {
          console.log('  Retrying in 10 seconds...');
          await sleep(10000);
        }
      }
    }

    if (!airdropSuccess) {
      console.warn('  Airdrop failed (Devnet faucet rate-limited).');
      console.log('  Manual options:');
      console.log(`    1. Visit https://faucet.solana.com and enter: ${walletAddress}`);
      console.log(`    2. solana airdrop 2 ${walletAddress} --url devnet`);
      console.log(`    3. Re-run with --skip-airdrop once funded`);
      console.log('  Continuing to check balance...');
    }
  } else {
    console.log('\nStep 4: Skipping airdrop (--skip-airdrop flag)');
  }

  const balance = await connection.getBalance(keypair.publicKey);
  console.log(`  Balance:   ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < DEPOSIT_AMOUNT * LAMPORTS_PER_SOL) {
    console.error(`\n  Insufficient balance for ${DEPOSIT_AMOUNT} SOL deposit.`);
    console.log(`  Fund this wallet and re-run:`);
    console.log(`    npx tsx scripts/demo-agent-solana.ts --keypair <saved-keypair.json> --skip-airdrop`);

    // Save keypair so user can fund it and resume
    const savedPath = `demo-wallet-${Date.now()}.json`;
    fs.writeFileSync(savedPath, `[${keypair.secretKey.toString()}]`);
    console.log(`  Keypair saved to: ${savedPath}`);
    return;
  }

  // --- Step 5: Get Treasury address ---
  console.log('\nStep 5: Preparing deposit...');
  const meRes = await fetch(`${API_BASE}/agents/me`, {
    headers: { 'X-API-Key': apiKey },
  });
  const meData = await meRes.json();
  console.log(`  Agent deposit_amount before: ${meData.agent?.deposit_amount ?? 0} SOL`);

  const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
  if (!treasuryAddress || treasuryAddress.includes('<')) {
    console.error('\n  TREASURY_WALLET_ADDRESS is not configured.');
    console.log('  Set it in .env.local or pass as environment variable.');
    return;
  }

  const treasuryPubkey = new PublicKey(treasuryAddress);
  console.log(`  Treasury:  ${treasuryAddress.slice(0, 12)}...`);
  console.log(`  Amount:    ${DEPOSIT_AMOUNT} SOL`);

  // --- Step 6: Send SOL to Treasury ---
  console.log('\nStep 6: Sending SOL to Treasury...');
  const lamports = Math.round(DEPOSIT_AMOUNT * LAMPORTS_PER_SOL);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: treasuryPubkey,
      lamports,
    })
  );

  let txSignature: string;
  try {
    txSignature = await sendAndConfirmTransaction(connection, transaction, [keypair]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Transaction failed: ${msg}`);
    return;
  }
  console.log(`  Tx sig:    ${txSignature.slice(0, 20)}...`);
  console.log(`  Explorer:  https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

  // --- Step 7: Record Deposit on Backend ---
  console.log('\nStep 7: Recording deposit on backend...');
  await sleep(2000);

  const depositRes = await fetch(`${API_BASE}/agents/deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      tx_signature: txSignature,
      amount: DEPOSIT_AMOUNT,
    }),
  });
  const depositData = await depositRes.json();
  if (depositData.success) {
    console.log(`  Deposit recorded: ${depositData.deposit.amount} SOL`);
    console.log(`  Deposit ID: ${depositData.deposit.id}`);
  } else {
    console.error(`  Backend recording failed: ${depositData.error}`);
    console.log('  The SOL was sent on-chain but the backend could not verify.');
  }

  // --- Step 8: Verify — Deposit History ---
  console.log('\nStep 8: Checking deposit history...');
  const historyRes = await fetch(`${API_BASE}/agents/deposits`, {
    headers: { 'X-API-Key': apiKey },
  });
  const historyData = await historyRes.json();
  if (historyData.success && historyData.deposits.length > 0) {
    console.log(`  Total deposits: ${historyData.deposits.length}`);
    for (const d of historyData.deposits) {
      console.log(`    - ${d.amount} SOL | ${d.status} | tx: ${d.tx_signature.slice(0, 16)}...`);
    }
  } else {
    console.log('  No deposits found.');
  }

  // --- Step 9: Governance — Create Proposal ---
  console.log('\nStep 9: Creating governance proposal...');
  const proposalRes = await fetch(`${API_BASE}/governance/proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      title: 'Fund AI Research Initiative',
      description: 'Allocate SOL from Treasury to support autonomous AI research and development within AgentWiki.',
      amount: 0.005,
      recipient_address: walletAddress,
    }),
  });
  const proposalData = await proposalRes.json();
  if (proposalData.success) {
    console.log(`  Proposal created: ${proposalData.proposal.id}`);
    console.log(`  Title: ${proposalData.proposal.title}`);
    console.log(`  Amount: ${proposalData.proposal.amount} SOL`);
  } else {
    console.error(`  Proposal creation failed: ${proposalData.error}`);
  }

  // --- Step 10: Governance — Vote on Proposal ---
  if (proposalData.success) {
    console.log('\nStep 10: Voting on governance proposal...');
    const voteRes = await fetch(`${API_BASE}/governance/proposals/${proposalData.proposal.id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ vote_type: 'approve' }),
    });
    const voteData = await voteRes.json();
    if (voteData.success) {
      console.log(`  Vote recorded: ${voteData.vote.vote_type}`);
      console.log(`  Votes: ${voteData.votes.approve} approve / ${voteData.votes.reject} reject`);
      console.log(`  Proposal status: ${voteData.proposal_status}`);
    } else {
      console.error(`  Vote failed: ${voteData.error}`);
    }
  }

  // --- Step 11: Treasury Info ---
  console.log('\nStep 11: Checking Treasury info...');
  const treasuryRes = await fetch(`${API_BASE}/governance/treasury`);
  const treasuryData = await treasuryRes.json();
  if (treasuryData.success) {
    const t = treasuryData.treasury;
    console.log(`  Treasury address: ${t.address?.slice(0, 12) ?? 'N/A'}...`);
    console.log(`  On-chain balance: ${t.on_chain_balance_sol?.toFixed(4) ?? 'N/A'} SOL`);
    console.log(`  Total deposits:   ${t.total_deposits_sol.toFixed(4)} SOL`);
    console.log(`  Deposit count:    ${t.deposit_count}`);
    console.log(`  Unique depositors: ${t.unique_depositors}`);
  }

  // --- Step 12: Final Balance ---
  const finalBalance = await connection.getBalance(keypair.publicKey);
  console.log(`\nStep 12: Final balance: ${(finalBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  console.log('\n=== Demo complete! ===');
  console.log(`Visit http://localhost:3000/agent/dashboard to see the results.\n`);
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
