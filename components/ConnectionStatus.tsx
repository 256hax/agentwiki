'use client';

import { useEventStream } from '@/lib/useEventStream';
import { useCallback } from 'react';

export default function ConnectionStatus() {
  const { connected } = useEventStream(useCallback(() => {}, []));

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500" title={connected ? 'Connected to live updates' : 'Disconnected'}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
      {connected ? 'Live' : 'Offline'}
    </div>
  );
}
