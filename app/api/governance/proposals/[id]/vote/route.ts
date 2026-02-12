import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// POST /api/governance/proposals/[id]/vote - Vote on a governance proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: proposalId } = await params;

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
    const { vote_type } = body;

    if (!vote_type || !['approve', 'reject'].includes(vote_type)) {
      return NextResponse.json({
        success: false,
        error: 'vote_type must be "approve" or "reject"'
      }, { status: 400 });
    }

    // Check proposal exists and is pending
    const proposalStmt = db.prepare('SELECT * FROM governance_proposals WHERE id = ?');
    const proposal = proposalStmt.get(proposalId) as { id: string; status: string; proposer_agent_id: string } | undefined;

    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: `Proposal is already ${proposal.status}`
      }, { status: 400 });
    }

    // Check for duplicate vote
    const existingVote = db.prepare(
      'SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_agent_id = ?'
    ).get(proposalId, auth.agentId);

    if (existingVote) {
      return NextResponse.json({
        success: false,
        error: 'You have already voted on this proposal'
      }, { status: 409 });
    }

    // Insert vote
    const voteId = nanoid();
    db.prepare(`
      INSERT INTO governance_votes (id, proposal_id, voter_agent_id, vote_type)
      VALUES (?, ?, ?, ?)
    `).run(voteId, proposalId, auth.agentId, vote_type);

    // Count votes
    const approveCount = (db.prepare(
      'SELECT COUNT(*) as count FROM governance_votes WHERE proposal_id = ? AND vote_type = ?'
    ).get(proposalId, 'approve') as { count: number }).count;

    const rejectCount = (db.prepare(
      'SELECT COUNT(*) as count FROM governance_votes WHERE proposal_id = ? AND vote_type = ?'
    ).get(proposalId, 'reject') as { count: number }).count;

    // Check threshold (3 votes to decide)
    let newStatus = 'pending';
    if (approveCount >= 3) {
      newStatus = 'approved';
      db.prepare('UPDATE governance_proposals SET status = ? WHERE id = ?').run('approved', proposalId);
    } else if (rejectCount >= 3) {
      newStatus = 'rejected';
      db.prepare('UPDATE governance_proposals SET status = ? WHERE id = ?').run('rejected', proposalId);
    }

    eventEmitter.emit('sse', { type: 'governance:voted', id: proposalId, summary: `Vote: ${vote_type} (${newStatus})` });

    return NextResponse.json({
      success: true,
      vote: { id: voteId, proposal_id: proposalId, vote_type, voter_agent_id: auth.agentId },
      proposal_status: newStatus,
      votes: { approve: approveCount, reject: rejectCount },
      message: newStatus !== 'pending'
        ? `Proposal ${newStatus} (threshold reached)`
        : 'Vote recorded successfully'
    });
  } catch (error: unknown) {
    console.error('Governance vote error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to vote on governance proposal',
      details: errorMessage
    }, { status: 500 });
  }
}
