import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';

export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);
  if (!auth.success || !auth.agentId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { wallet_address } = body;

    if (!wallet_address) {
      return NextResponse.json(
        { success: false, error: 'wallet_address is required' },
        { status: 400 }
      );
    }

    // Check if wallet is already linked to another agent
    const existingStmt = db.prepare('SELECT id FROM agents WHERE wallet_address = ? AND id != ?');
    const existing = existingStmt.get(wallet_address, auth.agentId);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'This wallet is already linked to another agent' },
        { status: 409 }
      );
    }

    // Update agent's wallet address
    const updateStmt = db.prepare('UPDATE agents SET wallet_address = ? WHERE id = ?');
    updateStmt.run(wallet_address, auth.agentId);

    return NextResponse.json({
      success: true,
      message: 'Wallet linked successfully',
      wallet_address,
    });
  } catch (error: unknown) {
    console.error('Wallet link error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to link wallet', details: errorMessage },
      { status: 500 }
    );
  }
}
