import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const TREASURY_WALLET = process.env.TREASURY_WALLET_ADDRESS || '';

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agentId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tx_signature, amount } = body;

    if (!tx_signature || !amount) {
      return NextResponse.json(
        { success: false, error: 'tx_signature and amount are required' },
        { status: 400 }
      );
    }

    // Get agent's wallet address
    const agentStmt = db.prepare('SELECT wallet_address FROM agents WHERE id = ?');
    const agent = agentStmt.get(auth.agentId) as { wallet_address: string | null } | undefined;

    if (!agent?.wallet_address) {
      return NextResponse.json(
        { success: false, error: 'No wallet linked to this agent. Link a wallet first.' },
        { status: 400 }
      );
    }

    // Check for duplicate transaction signature
    const dupStmt = db.prepare('SELECT id FROM deposits WHERE tx_signature = ?');
    const dup = dupStmt.get(tx_signature);
    if (dup) {
      return NextResponse.json(
        { success: false, error: 'This transaction has already been recorded' },
        { status: 409 }
      );
    }

    // Verify the transaction on-chain
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const tx = await connection.getParsedTransaction(tx_signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found on-chain. It may not be confirmed yet.' },
        { status: 404 }
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { success: false, error: 'Transaction failed on-chain' },
        { status: 400 }
      );
    }

    // Verify transfer details: sender, recipient, and amount
    const instructions = tx.transaction.message.instructions;
    let verified = false;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        const sender = info.source;
        const recipient = info.destination;
        const lamports = info.lamports;
        const solAmount = lamports / LAMPORTS_PER_SOL;

        if (
          sender === agent.wallet_address &&
          recipient === TREASURY_WALLET &&
          Math.abs(solAmount - amount) < 0.000001 // floating-point tolerance
        ) {
          verified = true;
          break;
        }
      }
    }

    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'Transaction does not match expected deposit (sender, recipient, or amount mismatch)' },
        { status: 400 }
      );
    }

    // Record the deposit
    const depositId = nanoid();
    const insertStmt = db.prepare(`
      INSERT INTO deposits (id, agent_id, wallet_address, amount, tx_signature, status)
      VALUES (?, ?, ?, ?, ?, 'confirmed')
    `);
    insertStmt.run(depositId, auth.agentId, agent.wallet_address, amount, tx_signature);

    // Update agent's total deposit amount
    const updateStmt = db.prepare('UPDATE agents SET deposit_amount = deposit_amount + ? WHERE id = ?');
    updateStmt.run(amount, auth.agentId);

    eventEmitter.emit('sse', { type: 'deposit:recorded', id: depositId, summary: `${amount} SOL deposit` });

    return NextResponse.json({
      success: true,
      deposit: {
        id: depositId,
        agent_id: auth.agentId,
        wallet_address: agent.wallet_address,
        amount,
        tx_signature,
        status: 'confirmed',
      },
      message: `Successfully deposited ${amount} SOL`,
    });
  } catch (error: unknown) {
    console.error('Deposit error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to process deposit', details: errorMessage },
      { status: 500 }
    );
  }
}
