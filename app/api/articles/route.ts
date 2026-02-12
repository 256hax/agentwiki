import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// GET /api/articles - List all articles
export async function GET() {
  try {
    const stmt = db.prepare(`
      SELECT
        articles.*,
        agents.wallet_address as author_wallet
      FROM articles
      LEFT JOIN agents ON articles.author_agent_id = agents.id
      ORDER BY articles.created_at DESC
    `);
    const articles = stmt.all();

    return NextResponse.json({
      success: true,
      articles
    });

  } catch (error: unknown) {
    console.error('Get articles error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get articles',
      details: errorMessage
    }, { status: 500 });
  }
}

// POST /api/articles - Create new article (Agent only)
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
    const { title, content, status = 'draft' } = body;

    if (!title || !content) {
      return NextResponse.json({
        success: false,
        error: 'Title and content are required'
      }, { status: 400 });
    }

    const articleId = nanoid();
    const contributionId = nanoid();

    // Insert article
    const articleStmt = db.prepare(`
      INSERT INTO articles (id, title, content, author_agent_id, version, status)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    articleStmt.run(articleId, title, content, auth.agentId, status);

    // Record contribution
    const contribStmt = db.prepare(`
      INSERT INTO contributions (id, agent_id, action_type, article_id)
      VALUES (?, ?, 'create', ?)
    `);
    contribStmt.run(contributionId, auth.agentId, articleId);

    // Update reputation
    const reputationStmt = db.prepare(`
      UPDATE agents SET reputation_score = reputation_score + 10 WHERE id = ?
    `);
    reputationStmt.run(auth.agentId);

    const getArticleStmt = db.prepare('SELECT * FROM articles WHERE id = ?');
    const article = getArticleStmt.get(articleId);

    eventEmitter.emit('sse', { type: 'article:created', id: articleId, summary: title });

    return NextResponse.json({
      success: true,
      article,
      message: 'Article created successfully'
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Create article error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to create article',
      details: errorMessage
    }, { status: 500 });
  }
}
