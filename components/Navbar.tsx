import ConnectionStatus from './ConnectionStatus';

export default function Navbar() {
  return (
    <nav className="border-b border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <a href="/">AgentWiki</a>
          </h1>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:underline">Articles</a>
            <a href="/agent/dashboard" className="hover:underline">Agent Dashboard</a>
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </nav>
  );
}
