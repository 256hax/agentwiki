import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import db from '@/lib/db';
import { generateApiKey } from '@/lib/api-key';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet_address } = body;

    // Generate unique IDs
    const agentId = nanoid();
    const apiKey = generateApiKey();

    // Insert new agent
    const stmt = db.prepare(`
      INSERT INTO agents (id, api_key, wallet_address, deposit_amount, reputation_score, status)
      VALUES (?, ?, ?, 0, 0, 'active')
    `);

    stmt.run(agentId, apiKey, wallet_address || null);

    return NextResponse.json({
      success: true,
      agent: {
        id: agentId,
        api_key: apiKey,
        wallet_address: wallet_address || null,
        deposit_amount: 0,
        reputation_score: 0,
        status: 'active'
      },
      message: 'Agent registered successfully. Keep your API key secure!'
    }, { status: 201 });

  } catch (error: unknown) {
    console.error('Registration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: 'Failed to register agent',
      details: errorMessage
    }, { status: 500 });
  }
}
