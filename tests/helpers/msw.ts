import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

/** Any request without a handler fails the test instead of reaching the network. */
export const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
