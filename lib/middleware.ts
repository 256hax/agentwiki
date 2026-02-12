import { NextRequest } from 'next/server';
import db from './db';

export interface AuthenticatedRequest extends NextRequest {
  agentId?: string;
}

const MIN_DEPOSIT_SOL = parseFloat(process.env.MIN_DEPOSIT_SOL ?? '0.001');

export async function authenticateAgent(request: NextRequest): Promise<{ success: boolean; agentId?: string; depositAmount?: number; error?: string }> {
  const apiKey = request.headers.get('X-API-Key');

  if (!apiKey) {
    return { success: false, error: 'Missing authentication. Provide X-API-Key header.' };
  }

  try {
    const stmt = db.prepare('SELECT id, status, deposit_amount FROM agents WHERE api_key = ?');
    const agent = stmt.get(apiKey) as { id: string; status: string; deposit_amount: number } | undefined;

    if (!agent) {
      return { success: false, error: 'Invalid API key' };
    }

    if (agent.status !== 'active') {
      return { success: false, error: 'Agent is not active' };
    }

    return { success: true, agentId: agent.id, depositAmount: agent.deposit_amount };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

export function requireDeposit(depositAmount: number, minimum: number = MIN_DEPOSIT_SOL): { allowed: boolean; error?: string } {
  if (minimum <= 0) {
    return { allowed: true };
  }
  if (depositAmount >= minimum) {
    return { allowed: true };
  }
  return { allowed: false, error: `Minimum deposit of ${minimum} SOL required. Current deposit: ${depositAmount} SOL` };
}
