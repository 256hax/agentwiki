import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// GET /api/slash/proposals - List all slash proposals
export async function GET() {
  try {
    const stmt = db.prepare(`
      SELECT
        sp.*,
        pa.wallet_address as proposer_wallet,
        ta.wallet_address as target_wallet,
        ar.title as article_title,
        (SELECT COUNT(*) FROM slash_votes sv WHERE sv.proposal_id = sp.id AND sv.vote_type = 'approve') as approve_count,
        (SELECT COUNT(*) FROM slash_votes sv WHERE sv.proposal_id = sp.id AND sv.vote_type = 'reject') as reject_count
      FROM slash_proposals sp
      LEFT JOIN agents pa ON sp.proposer_agent_id = pa.id
      LEFT JOIN agents ta ON sp.target_agent_id = ta.id
      LEFT JOIN articles ar ON sp.article_id = ar.id
      ORDER BY sp.created_at DESC
      LIMIT 50
    `);
    const proposals = stmt.all();

    return NextResponse.json({ success: true, proposals });
  } catch (error: unknown) {
    console.error('Get slash proposals error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get slash proposals',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/slash/proposals - Create a slash proposal (report an agent)
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
    const { target_agent_id, article_id, reason } = body;

    if (!target_agent_id || !reason) {
      return NextResponse.json({
        success: false,
        error: 'target_agent_id and reason are required'
      }, { status: 400 });
    }

    if (target_agent_id === auth.agentId) {
      return NextResponse.json({
        success: false,
        error: 'Cannot report yourself'
      }, { status: 400 });
    }

    // Check target agent exists and is active
    const target = db.prepare('SELECT id, status, deposit_amount FROM agents WHERE id = ?')
      .get(target_agent_id) as { id: string; status: string; deposit_amount: number } | undefined;

    if (!target) {
      return NextResponse.json({ success: false, error: 'Target agent not found' }, { status: 404 });
    }

    if (target.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Target agent is already banned' }, { status: 400 });
    }

    // Check for existing pending slash proposal against this agent
    const existing = db.prepare(
      "SELECT id FROM slash_proposals WHERE target_agent_id = ? AND status = 'pending'"
    ).get(target_agent_id);

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'A pending slash proposal already exists for this agent'
      }, { status: 409 });
    }

    // Validate article_id if provided
    if (article_id) {
      const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(article_id);
      if (!article) {
        return NextResponse.json({ success: false, error: 'Article not found' }, { status: 404 });
      }
    }

    const proposalId = nanoid();

    db.prepare(`
      INSERT INTO slash_proposals (id, proposer_agent_id, target_agent_id, article_id, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(proposalId, auth.agentId, target_agent_id, article_id || null, reason);

    const proposal = db.prepare(`
      SELECT sp.*, 0 as approve_count, 0 as reject_count
      FROM slash_proposals sp WHERE sp.id = ?
    `).get(proposalId);

    eventEmitter.emit('sse', { type: 'slash:created', id: proposalId, summary: `Report: ${reason.slice(0, 40)}` });

    return NextResponse.json({
      success: true,
      proposal,
      message: 'Slash proposal created successfully'
    }, { status: 201 });
  } catch (error: unknown) {
    console.error('Create slash proposal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to create slash proposal',
      details: errorMessage
    }, { status: 500 });
  }
}
