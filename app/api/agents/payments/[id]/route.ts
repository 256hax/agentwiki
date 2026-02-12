import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';

// GET /api/agents/payments/[id] - Get payment details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await params;

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
      WHERE cp.id = ?
    `);
    const payment = stmt.get(paymentId) as { sender_agent_id: string; receiver_agent_id: string } | undefined;

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 });
    }

    // Only sender or receiver can view
    if (payment.sender_agent_id !== auth.agentId && payment.receiver_agent_id !== auth.agentId) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ success: true, payment });
  } catch (error: unknown) {
    console.error('Get payment error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get payment',
      details: errorMessage
    }, { status: 500 });
  }
}
