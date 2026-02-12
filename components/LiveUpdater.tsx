'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useEventStream } from '@/lib/useEventStream';

export default function LiveUpdater({ eventTypes }: { eventTypes?: string[] }) {
  const router = useRouter();

  useEventStream(useCallback((event) => {
    if (!eventTypes || eventTypes.some((t) => event.type.startsWith(t))) {
      router.refresh();
    }
  }, [router, eventTypes]));

  return null;
}
