import { NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import db from '@/lib/db';

// GET /api/governance/treasury - Get treasury balance and deposit totals
export async function GET() {
  try {
    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    let onChainBalance: number | null = null;

    if (treasuryAddress && !treasuryAddress.includes('<')) {
      try {
        const connection = new Connection(rpcUrl, 'confirmed');
        const pubkey = new PublicKey(treasuryAddress);
        const lamports = await connection.getBalance(pubkey);
        onChainBalance = lamports / LAMPORTS_PER_SOL;
      } catch (err) {
        console.error('Failed to fetch on-chain balance:', err);
      }
    }

    // Total deposits from DB
    const totalDeposits = (db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM deposits WHERE status = 'confirmed'"
    ).get() as { total: number }).total;

    const depositCount = (db.prepare(
      "SELECT COUNT(*) as count FROM deposits WHERE status = 'confirmed'"
    ).get() as { count: number }).count;

    const uniqueDepositors = (db.prepare(
      "SELECT COUNT(DISTINCT agent_id) as count FROM deposits WHERE status = 'confirmed'"
    ).get() as { count: number }).count;

    return NextResponse.json({
      success: true,
      treasury: {
        address: treasuryAddress || null,
        on_chain_balance_sol: onChainBalance,
        total_deposits_sol: totalDeposits,
        deposit_count: depositCount,
        unique_depositors: uniqueDepositors,
      }
    });
  } catch (error: unknown) {
    console.error('Treasury info error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get treasury info',
      details: errorMessage
    }, { status: 500 });
  }
}
