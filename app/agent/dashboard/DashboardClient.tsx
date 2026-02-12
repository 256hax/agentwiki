'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { useEventStream } from '@/lib/useEventStream';

export default function DashboardLive() {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  const { connected } = useEventStream(useCallback((event) => {
    setLastEvent(`${event.type}: ${event.summary || ''}`);
    router.refresh();
  }, [router]));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-500">{connected ? 'Live' : 'Reconnecting...'}</span>
      </div>
      {lastEvent && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded px-4 py-2 text-sm text-blue-700 dark:text-blue-300">
          Latest: {lastEvent}
        </div>
      )}
    </div>
  );
}
