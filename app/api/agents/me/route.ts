import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request);

  if (!auth.success) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }

  try {
    const stmt = db.prepare(`
      SELECT id, wallet_address, deposit_amount, reputation_score, created_at, status
      FROM agents WHERE id = ?
    `);
    const agent = stmt.get(auth.agentId);

    if (!agent) {
      return NextResponse.json({
        success: false,
        error: 'Agent not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      agent
    });

  } catch (error: unknown) {
    console.error('Get agent error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get agent info',
      details: errorMessage
    }, { status: 500 });
  }
}
