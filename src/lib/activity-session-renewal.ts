/**
 * Client-side renewal for the short-lived Discord Activity bearer session.
 *
 * The server caps each Activity session at one hour. Instead of handing a
 * token string to React (where a new value would re-run every effect that
 * depends on it, including the duel socket whose cleanup forfeits a live
 * match), consumers receive a stable `ActivityAuth` object and read the
 * current token at request time.
 */

export interface ActivityAuth {
  /** The newest bearer token. Read it when building each request. */
  getToken(): string | undefined;
  /**
   * Renew now (sharing any renewal already in flight). Resolves with the new
   * token, or `undefined` when renewal failed and a retry has been scheduled.
   */
  renew(): Promise<string | undefined>;
}

export interface RenewedActivitySession {
  token: string;
  /** Seconds until the server stops accepting `token`. */
  expiresIn: number;
}

/** Renew this long before the server-side expiry. */
export const ACTIVITY_RENEWAL_LEAD_SECONDS = 5 * 60;
const MIN_RENEWAL_DELAY_MS = 10_000;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;

/**
 * How long to wait before renewing a session that expires in
 * `expiresInSeconds`. Normally five minutes early; for short sessions it
 * renews halfway through instead, and never sooner than a small floor.
 */
export function activityRenewalDelayMs(expiresInSeconds: number): number {
  const lifetimeMs = Math.max(0, expiresInSeconds) * 1_000;
  const beforeExpiryMs = lifetimeMs - ACTIVITY_RENEWAL_LEAD_SECONDS * 1_000;

  return Math.max(MIN_RENEWAL_DELAY_MS, beforeExpiryMs, lifetimeMs / 2);
}

/** Exponential backoff after `failures` consecutive failed renewals (1-based). */
export function activityRenewalRetryDelayMs(failures: number): number {
  const exponent = Math.max(0, failures - 1);

  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
}

export interface ActivitySessionRenewerOptions {
  session: RenewedActivitySession;
  /** Re-authorizes with Discord and exchanges the code for a new session. */
  renewSession: () => Promise<RenewedActivitySession>;
  onRenewalError?: (error: unknown, failures: number) => void;
}

export class ActivitySessionRenewer implements ActivityAuth {
  private token: string;
  private failures = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<string | undefined> | undefined;
  private disposed = false;

  constructor(private readonly options: ActivitySessionRenewerOptions) {
    this.token = options.session.token;
    this.schedule(activityRenewalDelayMs(options.session.expiresIn));
  }

  getToken(): string | undefined {
    return this.token;
  }

  renew(): Promise<string | undefined> {
    if (this.disposed) {
      return Promise.resolve(undefined);
    }

    this.inFlight ??= this.runRenewal().finally(() => {
      this.inFlight = undefined;
    });

    return this.inFlight;
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);

    if (!this.disposed) {
      this.timer = setTimeout(() => void this.renew(), delayMs);
    }
  }

  private async runRenewal(): Promise<string | undefined> {
    clearTimeout(this.timer);
    this.timer = undefined;

    try {
      const session = await this.options.renewSession();

      if (this.disposed) {
        return undefined;
      }

      this.token = session.token;
      this.failures = 0;
      this.schedule(activityRenewalDelayMs(session.expiresIn));
      return session.token;
    } catch (error) {
      if (this.disposed) {
        return undefined;
      }

      this.failures += 1;
      this.options.onRenewalError?.(error, this.failures);
      this.schedule(activityRenewalRetryDelayMs(this.failures));
      return undefined;
    }
  }
}

/**
 * Runs `request` with the current token. If the server answers 401, renews
 * the session once and retries with the fresh token. Without Activity auth
 * (normal web cookies) the request runs once, unchanged.
 */
export async function fetchWithActivityRenewal(
  auth: ActivityAuth | undefined,
  request: (token: string | undefined) => Promise<Response>
): Promise<Response> {
  const response = await request(auth?.getToken());

  if (response.status !== 401 || !auth) {
    return response;
  }

  const renewedToken = await auth.renew();

  return renewedToken ? request(renewedToken) : response;
}
