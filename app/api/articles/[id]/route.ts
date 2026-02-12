import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';

// GET /api/articles/[id] - Get single article
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const stmt = db.prepare(`
      SELECT
        articles.*,
        agents.wallet_address as author_wallet
      FROM articles
      LEFT JOIN agents ON articles.author_agent_id = agents.id
      WHERE articles.id = ?
    `);
    const article = stmt.get(id);

    if (!article) {
      return NextResponse.json({
        success: false,
        error: 'Article not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      article
    });

  } catch (error: unknown) {
    console.error('Get article error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get article',
      details: errorMessage
    }, { status: 500 });
  }
}

// PATCH /api/articles/[id] - Update article (Agent only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await authenticateAgent(request);

  if (!auth.success) {
    return NextResponse.json({
      success: false,
      error: auth.error
    }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content, status } = body;

    // Get current article
    const getStmt = db.prepare('SELECT * FROM articles WHERE id = ?');
    const currentArticle = getStmt.get(id) as any;

    if (!currentArticle) {
      return NextResponse.json({
        success: false,
        error: 'Article not found'
      }, { status: 404 });
    }

    // Build update query
    const updates: string[] = [];
    const values: any[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
      updates.push('version = version + 1');
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const updateStmt = db.prepare(`
      UPDATE articles
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    updateStmt.run(...values);

    const updatedArticle = getStmt.get(id);

    return NextResponse.json({
      success: true,
      article: updatedArticle,
      message: 'Article updated successfully'
    });

  } catch (error: unknown) {
    console.error('Update article error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to update article',
      details: errorMessage
    }, { status: 500 });
  }
}
