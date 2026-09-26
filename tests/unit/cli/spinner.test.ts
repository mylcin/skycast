import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.fn();
const stop = vi.fn();
const factory = vi.fn(() => ({ start: () => (start(), { stop }) }));
vi.mock('yocto-spinner', () => ({ default: factory }));

const { createSpinner } = await import('../../../src/cli/spinner.ts');

describe('createSpinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when disabled', async () => {
    const spinner = createSpinner({ enabled: false, text: 'x', unicode: true });
    spinner.start();
    await vi.advanceTimersByTimeAsync(1000);
    spinner.stop();
    expect(factory).not.toHaveBeenCalled();
  });

  it('never appears for fast work', async () => {
    const spinner = createSpinner({ enabled: true, text: 'x', unicode: true });
    spinner.start();
    await vi.advanceTimersByTimeAsync(100);
    spinner.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(factory).not.toHaveBeenCalled();
  });

  it('appears after a moment on stderr, without its own signal handlers', async () => {
    const spinner = createSpinner({
      enabled: true,
      text: 'Fetching',
      unicode: false,
    });
    spinner.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Fetching',
        stream: process.stderr,
        handleSignals: false,
      })
    );
    expect(start).toHaveBeenCalledOnce();
    spinner.stop();
    expect(stop).toHaveBeenCalledOnce();
  });
});
