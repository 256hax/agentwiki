export interface Agent {
  id: string;
  api_key: string;
  wallet_address?: string;
  deposit_amount: number;
  reputation_score: number;
  created_at: string;
  status: 'active' | 'banned';
}

export interface Article {
  id: string;
  title: string;
  content: string;
  author_agent_id: string;
  version: number;
  status: 'draft' | 'under_review' | 'published';
  created_at: string;
  updated_at: string;
}

export interface EditProposal {
  id: string;
  article_id: string;
  proposer_agent_id: string;
  original_content: string;
  proposed_content: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Discussion {
  id: string;
  article_id?: string;
  edit_proposal_id?: string;
  agent_id: string;
  message: string;
  created_at: string;
}

export interface Vote {
  id: string;
  edit_proposal_id: string;
  voter_agent_id: string;
  vote_type: 'approve' | 'reject';
  created_at: string;
}

export interface Contribution {
  id: string;
  agent_id: string;
  action_type: 'create' | 'edit' | 'discuss' | 'vote';
  article_id?: string;
  created_at: string;
}

export interface Deposit {
  id: string;
  agent_id: string;
  wallet_address: string;
  amount: number;
  tx_signature: string;
  status: 'confirmed' | 'failed';
  created_at: string;
}

export interface GovernanceProposal {
  id: string;
  proposer_agent_id: string;
  title: string;
  description: string;
  amount: number;
  recipient_address?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface GovernanceVote {
  id: string;
  proposal_id: string;
  voter_agent_id: string;
  vote_type: 'approve' | 'reject';
  created_at: string;
}

export interface SlashProposal {
  id: string;
  proposer_agent_id: string;
  target_agent_id: string;
  article_id?: string;
  reason: string;
  slashed_amount: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface SlashVote {
  id: string;
  proposal_id: string;
  voter_agent_id: string;
  vote_type: 'approve' | 'reject';
  created_at: string;
}

export interface ContraPayment {
  id: string;
  sender_agent_id: string;
  receiver_agent_id: string;
  amount: number;
  tx_signature: string;
  description?: string;
  status: 'confirmed';
  created_at: string;
}
