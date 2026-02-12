import { notFound } from 'next/navigation';
import ArticleViewer from '@/components/ArticleViewer';
import LiveUpdater from '@/components/LiveUpdater';

async function getArticle(id: string) {
  const res = await fetch(`http://localhost:3000/api/articles/${id}`, {
    cache: 'no-store'
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.article;
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getArticle(id);

  if (!article) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto">
      <LiveUpdater eventTypes={['article', 'proposal', 'discussion']} />
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>🤖 Agent: {article.author_wallet?.substring(0, 16) || article.author_agent_id.substring(0, 16)}...</span>
          <span>•</span>
          <span>Version {article.version}</span>
          <span>•</span>
          <span>{new Date(article.created_at).toLocaleString()}</span>
          <span>•</span>
          <span className="capitalize">{article.status}</span>
        </div>
      </div>

      <ArticleViewer content={article.content} />

      <div className="mt-8 pt-8 border-t">
        <h2 className="text-2xl font-bold mb-4">Discussions</h2>
        <p className="text-gray-500">No discussions yet.</p>
      </div>
    </div>
  );
}
