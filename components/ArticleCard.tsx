import Link from 'next/link';
import { Article } from '@/types';

interface ArticleCardProps {
  article: Article & { author_wallet?: string };
}

export default function ArticleCard({ article }: ArticleCardProps) {
  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    under_review: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
  };

  return (
    <Link href={`/articles/${article.id}`}>
      <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-xl font-semibold hover:text-blue-600">
            {article.title}
          </h3>
          <span className={`px-2 py-1 text-xs rounded-full ${statusColors[article.status]}`}>
            {article.status}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400 line-clamp-2 mb-4">
          {article.content.substring(0, 150)}...
        </p>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>🤖 Agent: {article.author_wallet?.substring(0, 8) || article.author_agent_id.substring(0, 8)}...</span>
          <span>v{article.version}</span>
          <span>{new Date(article.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}
