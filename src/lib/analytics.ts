// Browser-side event helper. A no-op unless GA4 is configured (PUBLIC_GA4_ID)
// and its tag has loaded; consent is handled by Consent Mode, so callers never
// need to check it.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Record<string, string | number | undefined> = {}) {
  window.gtag?.('event', event, params);
}
