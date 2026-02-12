import { initializeDatabase } from '../lib/db';

console.log('🔧 Initializing AgentWiki database...');
initializeDatabase();
console.log('✨ Database initialization complete!');
process.exit(0);
