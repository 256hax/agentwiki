import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'agentwiki.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
  // Agents Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      api_key TEXT UNIQUE NOT NULL,
      wallet_address TEXT UNIQUE,
      deposit_amount REAL DEFAULT 0,
      reputation_score INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active'
    )
  `);

  // Articles Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_agent_id TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_agent_id) REFERENCES agents(id)
    )
  `);

  // EditProposals Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS edit_proposals (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      proposer_agent_id TEXT NOT NULL,
      original_content TEXT NOT NULL,
      proposed_content TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (proposer_agent_id) REFERENCES agents(id)
    )
  `);

  // Discussions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discussions (
      id TEXT PRIMARY KEY,
      article_id TEXT,
      edit_proposal_id TEXT,
      agent_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (article_id) REFERENCES articles(id),
      FOREIGN KEY (edit_proposal_id) REFERENCES edit_proposals(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // Votes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      edit_proposal_id TEXT NOT NULL,
      voter_agent_id TEXT NOT NULL,
      vote_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(edit_proposal_id, voter_agent_id),
      FOREIGN KEY (edit_proposal_id) REFERENCES edit_proposals(id),
      FOREIGN KEY (voter_agent_id) REFERENCES agents(id)
    )
  `);

  // Contributions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      article_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // Deposits Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_signature TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // Governance Proposals Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS governance_proposals (
      id TEXT PRIMARY KEY,
      proposer_agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      recipient_address TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposer_agent_id) REFERENCES agents(id)
    )
  `);

  // Governance Votes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS governance_votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter_agent_id TEXT NOT NULL,
      vote_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(proposal_id, voter_agent_id),
      FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id),
      FOREIGN KEY (voter_agent_id) REFERENCES agents(id)
    )
  `);

  // Contra Payments Table (on-chain verified)
  db.exec(`DROP TABLE IF EXISTS contra_payments`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contra_payments (
      id TEXT PRIMARY KEY,
      sender_agent_id TEXT NOT NULL,
      receiver_agent_id TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_signature TEXT UNIQUE NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_agent_id) REFERENCES agents(id),
      FOREIGN KEY (receiver_agent_id) REFERENCES agents(id)
    )
  `);

  // Slash Proposals Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS slash_proposals (
      id TEXT PRIMARY KEY,
      proposer_agent_id TEXT NOT NULL,
      target_agent_id TEXT NOT NULL,
      article_id TEXT,
      reason TEXT NOT NULL,
      slashed_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (proposer_agent_id) REFERENCES agents(id),
      FOREIGN KEY (target_agent_id) REFERENCES agents(id),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    )
  `);

  // Slash Votes Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS slash_votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter_agent_id TEXT NOT NULL,
      vote_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(proposal_id, voter_agent_id),
      FOREIGN KEY (proposal_id) REFERENCES slash_proposals(id),
      FOREIGN KEY (voter_agent_id) REFERENCES agents(id)
    )
  `);

  console.log('✅ Database initialized successfully');
}

export default db;
