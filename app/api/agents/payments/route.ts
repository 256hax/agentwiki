import { NextRequest, NextResponse } from 'next/server';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// GET /api/agents/payments - List agent's payment history (sent & received)
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const stmt = db.prepare(`
      SELECT
        cp.*,
        sa.wallet_address as sender_wallet,
        ra.wallet_address as receiver_wallet
      FROM contra_payments cp
      LEFT JOIN agents sa ON cp.sender_agent_id = sa.id
      LEFT JOIN agents ra ON cp.receiver_agent_id = ra.id
      WHERE cp.sender_agent_id = ? OR cp.receiver_agent_id = ?
      ORDER BY cp.created_at DESC
      LIMIT 100
    `);
    const payments = stmt.all(auth.agentId, auth.agentId);

    return NextResponse.json({ success: true, payments });
  } catch (error: unknown) {
    console.error('Get payments error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get payments',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/agents/payments - Record an on-chain agent-to-agent payment
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const depositCheck = requireDeposit(auth.depositAmount ?? 0);
  if (!depositCheck.allowed) {
    return NextResponse.json({ success: false, error: depositCheck.error }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { tx_signature, receiver_agent_id, amount, description } = body;

    if (!tx_signature || !receiver_agent_id || amount == null) {
      return NextResponse.json({
        success: false,
        error: 'tx_signature, receiver_agent_id, and amount are required'
      }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'amount must be a positive number'
      }, { status: 400 });
    }

    if (receiver_agent_id === auth.agentId) {
      return NextResponse.json({
        success: false,
        error: 'Cannot send payment to yourself'
      }, { status: 400 });
    }

    // Get sender's wallet address
    const sender = db.prepare('SELECT wallet_address FROM agents WHERE id = ?')
      .get(auth.agentId) as { wallet_address: string | null } | undefined;

    if (!sender?.wallet_address) {
      return NextResponse.json({
        success: false,
        error: 'No wallet linked to sender agent. Link a wallet first.'
      }, { status: 400 });
    }

    // Get receiver's wallet address
    const receiver = db.prepare('SELECT id, status, wallet_address FROM agents WHERE id = ?')
      .get(receiver_agent_id) as { id: string; status: string; wallet_address: string | null } | undefined;

    if (!receiver) {
      return NextResponse.json({ success: false, error: 'Receiver agent not found' }, { status: 404 });
    }
    if (receiver.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Receiver agent is not active' }, { status: 400 });
    }
    if (!receiver.wallet_address) {
      return NextResponse.json({
        success: false,
        error: 'Receiver agent has no linked wallet'
      }, { status: 400 });
    }

    // Check for duplicate tx_signature
    const dup = db.prepare('SELECT id FROM contra_payments WHERE tx_signature = ?').get(tx_signature);
    if (dup) {
      return NextResponse.json({
        success: false,
        error: 'This transaction has already been recorded'
      }, { status: 409 });
    }

    // Verify the transaction on-chain
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
    const tx = await connection.getParsedTransaction(tx_signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json({
        success: false,
        error: 'Transaction not found on-chain. It may not be confirmed yet.'
      }, { status: 404 });
    }

    if (tx.meta?.err) {
      return NextResponse.json({
        success: false,
        error: 'Transaction failed on-chain'
      }, { status: 400 });
    }

    // Verify transfer details: sender wallet → receiver wallet, correct amount
    const instructions = tx.transaction.message.instructions;
    let verified = false;

    for (const ix of instructions) {
      if ('parsed' in ix && ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        const txSender = info.source;
        const txRecipient = info.destination;
        const lamports = info.lamports;
        const solAmount = lamports / LAMPORTS_PER_SOL;

        if (
          txSender === sender.wallet_address &&
          txRecipient === receiver.wallet_address &&
          Math.abs(solAmount - amount) < 0.000001
        ) {
          verified = true;
          break;
        }
      }
    }

    if (!verified) {
      return NextResponse.json({
        success: false,
        error: 'Transaction does not match expected payment (sender, recipient, or amount mismatch)'
      }, { status: 400 });
    }

    // Record the payment
    const paymentId = nanoid();
    db.prepare(`
      INSERT INTO contra_payments (id, sender_agent_id, receiver_agent_id, amount, tx_signature, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(paymentId, auth.agentId, receiver_agent_id, amount, tx_signature, description || null);

    const payment = db.prepare('SELECT * FROM contra_payments WHERE id = ?').get(paymentId);

    eventEmitter.emit('sse', { type: 'payment:recorded', id: paymentId, summary: `${amount} SOL payment` });

    return NextResponse.json({
      success: true,
      payment,
      message: `Payment of ${amount} SOL verified on-chain and recorded`
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Send payment error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to process payment',
      details: errorMessage
    }, { status: 500 });
  }
}
