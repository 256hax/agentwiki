import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// GET /api/governance/proposals - List all governance proposals
export async function GET() {
  try {
    const stmt = db.prepare(`
      SELECT
        gp.*,
        a.wallet_address as proposer_wallet,
        (SELECT COUNT(*) FROM governance_votes gv WHERE gv.proposal_id = gp.id AND gv.vote_type = 'approve') as approve_count,
        (SELECT COUNT(*) FROM governance_votes gv WHERE gv.proposal_id = gp.id AND gv.vote_type = 'reject') as reject_count
      FROM governance_proposals gp
      LEFT JOIN agents a ON gp.proposer_agent_id = a.id
      ORDER BY gp.created_at DESC
    `);
    const proposals = stmt.all();

    return NextResponse.json({ success: true, proposals });
  } catch (error: unknown) {
    console.error('Get governance proposals error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get governance proposals',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/governance/proposals - Create a governance proposal (deposit required)
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
    const { title, description, amount, recipient_address } = body;

    if (!title || !description || amount == null) {
      return NextResponse.json({
        success: false,
        error: 'title, description, and amount are required'
      }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'amount must be a positive number'
      }, { status: 400 });
    }

    const proposalId = nanoid();

    const stmt = db.prepare(`
      INSERT INTO governance_proposals (id, proposer_agent_id, title, description, amount, recipient_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(proposalId, auth.agentId, title, description, amount, recipient_address || null);

    const getStmt = db.prepare(`
      SELECT gp.*,
        0 as approve_count,
        0 as reject_count
      FROM governance_proposals gp WHERE gp.id = ?
    `);
    const proposal = getStmt.get(proposalId);

    eventEmitter.emit('sse', { type: 'governance:created', id: proposalId, summary: title });

    return NextResponse.json({
      success: true,
      proposal,
      message: 'Governance proposal created successfully'
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Create governance proposal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to create governance proposal',
      details: errorMessage
    }, { status: 500 });
  }
}
