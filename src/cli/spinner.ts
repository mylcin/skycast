export interface Spinner {
  start(): void;
  stop(): void;
}

const NOOP: Spinner = { start: () => undefined, stop: () => undefined };

/** Waits this long before drawing, so fast (cached) runs never flicker. */
const DELAY_MS = 200;

/**
 * A spinner on stderr for slow requests. Disabled unless someone is watching
 * a terminal; the library is only loaded when it is about to be shown.
 */
export function createSpinner(options: {
  enabled: boolean;
  text: string;
  unicode: boolean;
}): Spinner {
  if (!options.enabled) return NOOP;
  let timer: NodeJS.Timeout | undefined;
  let active: { stop(): unknown } | undefined;
  let stopped = true;

  return {
    start() {
      stopped = false;
      timer = setTimeout(() => {
        void import('yocto-spinner').then(({ default: yoctoSpinner }) => {
          if (stopped) return;
          active = yoctoSpinner({
            text: options.text,
            stream: process.stderr,
            // We own SIGINT: the handler aborts requests and cleans up.
            handleSignals: false,
            spinner: options.unicode
              ? {
                  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
                  interval: 80,
                }
              : { frames: ['-', '\\', '|', '/'], interval: 100 },
          }).start();
        });
      }, DELAY_MS);
      timer.unref();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      active?.stop();
      active = undefined;
    },
  };
}
