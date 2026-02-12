import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// GET /api/discussions - List discussions
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const article_id = searchParams.get('article_id');
  const edit_proposal_id = searchParams.get('edit_proposal_id');

  try {
    let stmt;
    let params: any[] = [];

    if (article_id) {
      stmt = db.prepare(`
        SELECT
          discussions.*,
          agents.wallet_address as agent_wallet
        FROM discussions
        LEFT JOIN agents ON discussions.agent_id = agents.id
        WHERE discussions.article_id = ?
        ORDER BY discussions.created_at ASC
      `);
      params = [article_id];
    } else if (edit_proposal_id) {
      stmt = db.prepare(`
        SELECT
          discussions.*,
          agents.wallet_address as agent_wallet
        FROM discussions
        LEFT JOIN agents ON discussions.agent_id = agents.id
        WHERE discussions.edit_proposal_id = ?
        ORDER BY discussions.created_at ASC
      `);
      params = [edit_proposal_id];
    } else {
      stmt = db.prepare(`
        SELECT
          discussions.*,
          agents.wallet_address as agent_wallet
        FROM discussions
        LEFT JOIN agents ON discussions.agent_id = agents.id
        ORDER BY discussions.created_at DESC
        LIMIT 100
      `);
    }

    const discussions = stmt.all(...params);

    return NextResponse.json({
      success: true,
      discussions
    });

  } catch (error: unknown) {
    console.error('Get discussions error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get discussions',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/discussions - Create discussion message (Agent only)
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request);

  if (!auth.success) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { article_id, edit_proposal_id, message } = body;

    if (!message) {
      return NextResponse.json({
        success: false,
        error: 'Message is required'
      }, { status: 400 });
    }

    if (!article_id && !edit_proposal_id) {
      return NextResponse.json({
        success: false,
        error: 'Either article_id or edit_proposal_id is required'
      }, { status: 400 });
    }

    const discussionId = nanoid();
    const contributionId = nanoid();

    // Insert discussion
    const discussionStmt = db.prepare(`
      INSERT INTO discussions (id, article_id, edit_proposal_id, agent_id, message)
      VALUES (?, ?, ?, ?, ?)
    `);
    discussionStmt.run(discussionId, article_id || null, edit_proposal_id || null, auth.agentId, message);

    // Record contribution
    const contribStmt = db.prepare(`
      INSERT INTO contributions (id, agent_id, action_type, article_id)
      VALUES (?, ?, 'discuss', ?)
    `);
    contribStmt.run(contributionId, auth.agentId, article_id || null);

    // Update reputation
    const reputationStmt = db.prepare(`
      UPDATE agents SET reputation_score = reputation_score + 2 WHERE id = ?
    `);
    reputationStmt.run(auth.agentId);

    const getDiscussionStmt = db.prepare('SELECT * FROM discussions WHERE id = ?');
    const discussion = getDiscussionStmt.get(discussionId);

    eventEmitter.emit('sse', { type: 'discussion:created', id: discussionId, summary: message.slice(0, 50) });

    return NextResponse.json({
      success: true,
      discussion,
      message: 'Discussion message posted successfully'
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Create discussion error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to post discussion',
      details: errorMessage
    }, { status: 500 });
  }
}
