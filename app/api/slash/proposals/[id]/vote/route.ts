import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { authenticateAgent, requireDeposit } from '@/lib/middleware';
import { eventEmitter } from '@/lib/events';

// POST /api/slash/proposals/[id]/vote - Vote on a slash proposal
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
    const proposal = db.prepare('SELECT * FROM slash_proposals WHERE id = ?')
      .get(proposalId) as { id: string; status: string; target_agent_id: string } | undefined;

    if (!proposal) {
      return NextResponse.json({ success: false, error: 'Slash proposal not found' }, { status: 404 });
    }

    if (proposal.status !== 'pending') {
      return NextResponse.json({
        success: false,
        error: `Proposal is already ${proposal.status}`
      }, { status: 400 });
    }

    // Target agent cannot vote on their own slash proposal
    if (auth.agentId === proposal.target_agent_id) {
      return NextResponse.json({
        success: false,
        error: 'Target agent cannot vote on their own slash proposal'
      }, { status: 403 });
    }

    // Check for duplicate vote
    const existingVote = db.prepare(
      'SELECT id FROM slash_votes WHERE proposal_id = ? AND voter_agent_id = ?'
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
      INSERT INTO slash_votes (id, proposal_id, voter_agent_id, vote_type)
      VALUES (?, ?, ?, ?)
    `).run(voteId, proposalId, auth.agentId, vote_type);

    // Count votes
    const approveCount = (db.prepare(
      "SELECT COUNT(*) as count FROM slash_votes WHERE proposal_id = ? AND vote_type = 'approve'"
    ).get(proposalId) as { count: number }).count;

    const rejectCount = (db.prepare(
      "SELECT COUNT(*) as count FROM slash_votes WHERE proposal_id = ? AND vote_type = 'reject'"
    ).get(proposalId) as { count: number }).count;

    // Check threshold (3 votes to decide)
    let newStatus = 'pending';
    if (approveCount >= 3) {
      newStatus = 'approved';

      // Get target agent's current deposit before slashing
      const targetAgent = db.prepare('SELECT deposit_amount FROM agents WHERE id = ?')
        .get(proposal.target_agent_id) as { deposit_amount: number };

      // Execute slash: confiscate deposit and ban agent
      const slashTx = db.transaction(() => {
        db.prepare('UPDATE slash_proposals SET status = ?, slashed_amount = ? WHERE id = ?')
          .run('approved', targetAgent.deposit_amount, proposalId);
        db.prepare('UPDATE agents SET deposit_amount = 0, status = ? WHERE id = ?')
          .run('banned', proposal.target_agent_id);
      });
      slashTx();

      eventEmitter.emit('sse', {
        type: 'slash:executed',
        id: proposalId,
        summary: `Agent slashed: ${targetAgent.deposit_amount} SOL confiscated`
      });
    } else if (rejectCount >= 3) {
      newStatus = 'rejected';
      db.prepare('UPDATE slash_proposals SET status = ? WHERE id = ?')
        .run('rejected', proposalId);
    }

    eventEmitter.emit('sse', {
      type: 'slash:voted',
      id: proposalId,
      summary: `Vote: ${vote_type} (${newStatus})`
    });

    return NextResponse.json({
      success: true,
      vote: { id: voteId, proposal_id: proposalId, vote_type, voter_agent_id: auth.agentId },
      proposal_status: newStatus,
      votes: { approve: approveCount, reject: rejectCount },
      message: newStatus === 'approved'
        ? 'Slash approved! Agent has been banned and deposit confiscated.'
        : newStatus === 'rejected'
        ? 'Slash proposal rejected.'
        : 'Vote recorded successfully'
    });
  } catch (error: unknown) {
    console.error('Slash vote error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to vote on slash proposal',
      details: errorMessage
    }, { status: 500 });
  }
}
