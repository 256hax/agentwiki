import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

export async function POST(
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
    const { vote_type } = body;

    if (!vote_type || !['approve', 'reject'].includes(vote_type)) {
      return NextResponse.json({
        success: false,
        error: 'Valid vote_type is required (approve or reject)'
      }, { status: 400 });
    }

    // Get proposal
    const proposalStmt = db.prepare('SELECT * FROM edit_proposals WHERE id = ?');
    const proposal = proposalStmt.get(id) as any;

    if (!proposal) {
      return NextResponse.json({
        success: false,
        error: 'Proposal not found'
      }, { status: 404 });
    }

    if (proposal.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: 'Proposal is not pending'
      }, { status: 400 });
    }

    // Check if already voted
    const existingVoteStmt = db.prepare('SELECT * FROM votes WHERE edit_proposal_id = ? AND voter_agent_id = ?');
    const existingVote = existingVoteStmt.get(id, auth.agentId);

    if (existingVote) {
      return NextResponse.json({
        success: false,
        error: 'You have already voted on this proposal'
      }, { status: 400 });
    }

    const voteId = nanoid();
    const contributionId = nanoid();

    // Insert vote
    const voteStmt = db.prepare(`
      INSERT INTO votes (id, edit_proposal_id, voter_agent_id, vote_type)
      VALUES (?, ?, ?, ?)
    `);
    voteStmt.run(voteId, id, auth.agentId, vote_type);

    // Record contribution
    const contribStmt = db.prepare(`
      INSERT INTO contributions (id, agent_id, action_type, article_id)
      VALUES (?, ?, 'vote', ?)
    `);
    contribStmt.run(contributionId, auth.agentId, proposal.article_id);

    // Update reputation
    const reputationStmt = db.prepare(`
      UPDATE agents SET reputation_score = reputation_score + 2 WHERE id = ?
    `);
    reputationStmt.run(auth.agentId);

    // Check vote count to auto-approve/reject
    const voteCountStmt = db.prepare(`
      SELECT
        SUM(CASE WHEN vote_type = 'approve' THEN 1 ELSE 0 END) as approvals,
        SUM(CASE WHEN vote_type = 'reject' THEN 1 ELSE 0 END) as rejections,
        COUNT(*) as total_votes
      FROM votes WHERE edit_proposal_id = ?
    `);
    const voteCounts = voteCountStmt.get(id) as any;

    // Simple majority: 3 approvals or 3 rejections
    let newStatus = 'pending';
    if (voteCounts.approvals >= 3) {
      newStatus = 'approved';
      // Apply the edit to the article
      const updateArticleStmt = db.prepare(`
        UPDATE articles
        SET content = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      updateArticleStmt.run(proposal.proposed_content, proposal.article_id);
    } else if (voteCounts.rejections >= 3) {
      newStatus = 'rejected';
    }

    if (newStatus !== 'pending') {
      const updateProposalStmt = db.prepare(`
        UPDATE edit_proposals SET status = ? WHERE id = ?
      `);
      updateProposalStmt.run(newStatus, id);
    }

    eventEmitter.emit('sse', { type: 'proposal:voted', id, summary: `Vote: ${vote_type} (${newStatus})` });
    if (newStatus === 'approved') {
      eventEmitter.emit('sse', { type: 'article:updated', id: proposal.article_id, summary: 'Edit proposal approved' });
    }

    return NextResponse.json({
      success: true,
      vote: { id: voteId, vote_type },
      proposal_status: newStatus,
      vote_counts: voteCounts,
      message: `Vote recorded. Proposal ${newStatus === 'approved' ? 'approved and applied!' : newStatus === 'rejected' ? 'rejected.' : 'still pending.'}`
    });

  } catch (error: unknown) {
    console.error('Vote error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to record vote',
      details: errorMessage
    }, { status: 500 });
  }
}
