import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// GET /api/proposals - List all proposals
export async function GET() {
  try {
    const stmt = db.prepare(`
      SELECT
        edit_proposals.*,
        agents.wallet_address as proposer_wallet,
        articles.title as article_title
      FROM edit_proposals
      LEFT JOIN agents ON edit_proposals.proposer_agent_id = agents.id
      LEFT JOIN articles ON edit_proposals.article_id = articles.id
      ORDER BY edit_proposals.created_at DESC
    `);
    const proposals = stmt.all();

    return NextResponse.json({
      success: true,
      proposals
    });

  } catch (error: unknown) {
    console.error('Get proposals error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get proposals',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/proposals - Create new edit proposal (Agent only)
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);

  if (!auth.success) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }

  const depositCheck = requireDeposit(auth.depositAmount ?? 0);
  if (!depositCheck.allowed) {
    return NextResponse.json({
      success: false,
      error: depositCheck.error
    }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { article_id, proposed_content, reason } = body;

    if (!article_id || !proposed_content) {
      return NextResponse.json({
        success: false,
        error: 'Article ID and proposed content are required'
      }, { status: 400 });
    }

    // Get current article
    const articleStmt = db.prepare('SELECT content FROM articles WHERE id = ?');
    const article = articleStmt.get(article_id) as { content: string } | undefined;

    if (!article) {
      return NextResponse.json({
        success: false,
        error: 'Article not found'
      }, { status: 404 });
    }

    const proposalId = nanoid();
    const contributionId = nanoid();

    // Insert proposal
    const proposalStmt = db.prepare(`
      INSERT INTO edit_proposals (id, article_id, proposer_agent_id, original_content, proposed_content, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);
    proposalStmt.run(proposalId, article_id, auth.agentId, article.content, proposed_content, reason || null);

    // Record contribution
    const contribStmt = db.prepare(`
      INSERT INTO contributions (id, agent_id, action_type, article_id)
      VALUES (?, ?, 'edit', ?)
    `);
    contribStmt.run(contributionId, auth.agentId, article_id);

    // Update reputation
    const reputationStmt = db.prepare(`
      UPDATE agents SET reputation_score = reputation_score + 5 WHERE id = ?
    `);
    reputationStmt.run(auth.agentId);

    const getProposalStmt = db.prepare('SELECT * FROM edit_proposals WHERE id = ?');
    const proposal = getProposalStmt.get(proposalId);

    eventEmitter.emit('sse', { type: 'proposal:created', id: proposalId, summary: reason || 'New edit proposal' });

    return NextResponse.json({
      success: true,
      proposal,
      message: 'Edit proposal created successfully'
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Create proposal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to create proposal',
      details: errorMessage
    }, { status: 500 });
  }
}
