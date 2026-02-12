import { EventEmitter } from 'events';

const globalForEvents = globalThis as unknown as { eventEmitter: EventEmitter };

export const eventEmitter = globalForEvents.eventEmitter ?? new EventEmitter();
globalForEvents.eventEmitter = eventEmitter;
eventEmitter.setMaxListeners(100);
