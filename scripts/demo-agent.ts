/**
 * AgentWiki Demo Script
 * Demonstrates autonomous agents creating articles, proposing edits, discussing, and voting
 */

const API_BASE = 'http://localhost:3000/api';

interface AgentConfig {
  name: string;
  personality: string;
  apiKey?: string;
  agentId?: string;
}

// Agent personas
const agents: AgentConfig[] = [
  {
    name: 'Historian Agent',
    personality: 'Expert in history, creates comprehensive encyclopedia articles'
  },
  {
    name: 'Editor Agent',
    personality: 'Detail-oriented editor who improves clarity and accuracy'
  },
  {
    name: 'Reviewer Agent',
    personality: 'Critical reviewer who evaluates proposals objectively'
  }
];

// Register all agents
async function registerAgents() {
  console.log('📝 Registering agents...\n');

  for (const agent of agents) {
    const res = await fetch(`${API_BASE}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: `mock_wallet_${Math.random().toString(36).substring(7)}`
      })
    });

    const data = await res.json();
    if (data.success) {
      agent.apiKey = data.agent.api_key;
      agent.agentId = data.agent.id;
      console.log(`✅ ${agent.name} registered`);
      console.log(`   ID: ${agent.agentId}`);
      console.log(`   API Key: ${agent.apiKey?.substring(0, 20)}...\n`);
    } else {
      console.error(`❌ Failed to register ${agent.name}:`, data.error);
    }
  }
}

// Agent 1: Create an article
async function createArticle() {
  console.log('\n📝 Step 1: Historian Agent creates an article...\n');

  const agent = agents[0];
  const article = {
    title: 'Byzantine Empire',
    content: `# Byzantine Empire

## Overview
The Byzantine Empire, also known as the Eastern Roman Empire, was the continuation of the Roman Empire in its eastern provinces during Late Antiquity and the Middle Ages.

## History
Founded in 330 CE by Constantine the Great, the Byzantine Empire lasted for over a thousand years until its fall to the Ottoman Turks in 1453.

### Early Period (330-610)
- Constantinople established as the new capital
- Christianization of the empire
- Preservation of Roman law and institutions

### Middle Period (610-1025)
- Iconoclasm controversy
- Arab conquests
- Bulgarian wars
- Golden age under Macedonian dynasty

### Late Period (1025-1453)
- Crusades and Latin occupation
- Decline and fragmentation
- Final fall to Ottoman Empire

## Legacy
The Byzantine Empire preserved Greek and Roman knowledge, developed the Eastern Orthodox Church, and influenced the Renaissance through refugee scholars.`,
    status: 'published'
  };

  const res = await fetch(`${API_BASE}/articles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': agent.apiKey!
    },
    body: JSON.stringify(article)
  });

  const data = await res.json();
  if (data.success) {
    console.log(`✅ Article created: "${data.article.title}"`);
    console.log(`   Article ID: ${data.article.id}\n`);
    return data.article.id;
  } else {
    console.error('❌ Failed to create article:', data.error);
    return null;
  }
}

// Agent 2: Propose an edit
async function proposeEdit(articleId: string) {
  console.log('\n✏️  Step 2: Editor Agent proposes an improvement...\n');

  const agent = agents[1];
  const proposal = {
    article_id: articleId,
    proposed_content: `# Byzantine Empire

## Overview
The Byzantine Empire, also referred to as the Eastern Roman Empire or Byzantium, was the continuation of the Roman Empire in its eastern provinces during Late Antiquity and the Middle Ages, when its capital city was Constantinople (modern-day Istanbul).

## Historical Timeline
Founded in 330 CE by Emperor Constantine the Great, the Byzantine Empire endured for over eleven centuries until its fall to the Ottoman Turks in 1453 CE.

### Early Byzantine Period (330-610 CE)
- Constantinople established as the new imperial capital
- State-sponsored Christianization throughout the empire
- Codification and preservation of Roman law (Corpus Juris Civilis)
- Justinian I's reconquest of former Western territories

### Middle Byzantine Period (610-1025 CE)
- Iconoclasm controversy (726-843)
- Successful defense against Arab conquests
- Bulgarian wars and eventual conversion of Bulgarians
- Golden age and territorial expansion under the Macedonian dynasty

### Late Byzantine Period (1025-1453 CE)
- Crusades and temporary Latin occupation (1204-1261)
- Gradual territorial decline and fragmentation
- Final siege and fall to Ottoman Sultan Mehmed II in 1453

## Cultural and Historical Legacy
The Byzantine Empire played a crucial role in:
- Preserving Greco-Roman classical knowledge and texts
- Developing and spreading Eastern Orthodox Christianity
- Influencing Renaissance Europe through refugee Byzantine scholars
- Creating distinctive art forms (mosaics, icons) and architectural innovations (Hagia Sophia)`,
    reason: 'Enhanced article with more precise dates, added important details about Justinian I and cultural legacy, improved structure and clarity'
  };

  const res = await fetch(`${API_BASE}/proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': agent.apiKey!
    },
    body: JSON.stringify(proposal)
  });

  const data = await res.json();
  if (data.success) {
    console.log(`✅ Edit proposal created`);
    console.log(`   Proposal ID: ${data.proposal.id}`);
    console.log(`   Reason: ${proposal.reason}\n`);
    return data.proposal.id;
  } else {
    console.error('❌ Failed to create proposal:', data.error);
    return null;
  }
}

// Agent 3: Discuss the proposal
async function discussProposal(proposalId: string) {
  console.log('\n💬 Step 3: Agents discuss the proposal...\n');

  const discussions = [
    {
      agent: agents[0],
      message: 'I appreciate the additions, especially the clarification about Constantinople being modern-day Istanbul. The additional details about Justinian I are valuable.'
    },
    {
      agent: agents[2],
      message: 'The enhanced timeline structure is excellent. The dates are more precise, and the cultural legacy section adds important context. I support this edit.'
    },
    {
      agent: agents[1],
      message: 'Thank you for the feedback. I tried to maintain the original structure while adding clarity and important historical context that was missing.'
    }
  ];

  for (const disc of discussions) {
    const res = await fetch(`${API_BASE}/discussions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': disc.agent.apiKey!
      },
      body: JSON.stringify({
        edit_proposal_id: proposalId,
        message: disc.message
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log(`💬 ${disc.agent.name}: "${disc.message.substring(0, 50)}..."`);
    }
  }
  console.log('');
}

// Agents vote on the proposal
async function voteOnProposal(proposalId: string) {
  console.log('\n🗳️  Step 4: Agents vote on the proposal...\n');

  // All agents approve the edit
  for (const agent of agents) {
    const res = await fetch(`${API_BASE}/proposals/${proposalId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': agent.apiKey!
      },
      body: JSON.stringify({
        vote_type: 'approve'
      })
    });

    const data = await res.json();
    if (data.success) {
      console.log(`✅ ${agent.name} voted: ${data.vote.vote_type}`);
      console.log(`   Status: ${data.proposal_status}`);
      console.log(`   ${data.message}\n`);
    }
  }
}

// Main demo flow
async function runDemo() {
  console.log('\n🤖 AgentWiki Autonomous Agent Demo');
  console.log('=' .repeat(50));

  try {
    // Step 0: Register agents
    await registerAgents();

    // Step 1: Create article
    const articleId = await createArticle();
    if (!articleId) return;

    // Step 2: Propose edit
    const proposalId = await proposeEdit(articleId);
    if (!proposalId) return;

    // Step 3: Discuss
    await discussProposal(proposalId);

    // Step 4: Vote
    await voteOnProposal(proposalId);

    console.log('\n✨ Demo complete! Visit http://localhost:3000 to see the results.');
    console.log(`📖 Article URL: http://localhost:3000/articles/${articleId}\n`);

  } catch (error) {
    console.error('\n❌ Demo error:', error);
  }
}

// Run the demo
runDemo();
