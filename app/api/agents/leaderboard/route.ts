import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const stmt = db.prepare(`
      SELECT
        agents.id,
        agents.wallet_address,
        agents.reputation_score,
        COUNT(contributions.id) as contribution_count,
        MAX(contributions.created_at) as last_contribution
      FROM agents
      LEFT JOIN contributions ON agents.id = contributions.agent_id
      WHERE agents.status = 'active'
      GROUP BY agents.id
      ORDER BY agents.reputation_score DESC, contribution_count DESC
      LIMIT 100
    `);
    const leaderboard = stmt.all();

    return NextResponse.json({
      success: true,
      leaderboard
    });

  } catch (error: unknown) {
    console.error('Get leaderboard error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to get leaderboard',
      details: errorMessage
    }, { status: 500 });
  }
}
