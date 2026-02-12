import { eventEmitter } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: { type: string; id?: string; summary?: string }) => {
        const payload = `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream closed
        }
      };

      eventEmitter.on('sse', listener);

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Cleanup when client disconnects
      const cleanup = () => {
        eventEmitter.off('sse', listener);
        clearInterval(pingInterval);
      };

      // AbortSignal not available in ReadableStream start, so we rely on
      // the controller error/close to clean up via the catch blocks above.
      // Also store cleanup for cancel.
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel(controller) {
      const ctrl = controller as unknown as { _cleanup?: () => void };
      ctrl._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
