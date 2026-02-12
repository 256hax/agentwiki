import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agentId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const stmt = db.prepare(`
      SELECT id, agent_id, wallet_address, amount, tx_signature, status, created_at
      FROM deposits
      WHERE agent_id = ?
      ORDER BY created_at DESC
    `);
    const deposits = stmt.all(auth.agentId);

    return NextResponse.json({
      success: true,
      deposits,
    });
  } catch (error: unknown) {
    console.error('Get deposits error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to get deposit history', details: errorMessage },
      { status: 500 }
    );
  }
}
