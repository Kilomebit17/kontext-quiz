/** Lazily initialise Sentry only when a DSN is configured. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      })
    })
    .catch(() => {
      // observability must never break the app
    })
}
