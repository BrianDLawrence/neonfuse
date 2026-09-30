import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivitySessionRenewer,
  activityRenewalDelayMs,
  activityRenewalRetryDelayMs,
  fetchWithActivityRenewal,
  type ActivityAuth,
  type RenewedActivitySession
} from "./activity-session-renewal";

describe("activityRenewalDelayMs", () => {
  it("renews an hour-long session five minutes before it expires", () => {
    expect(activityRenewalDelayMs(60 * 60)).toBe(55 * 60 * 1_000);
  });

  it("renews short sessions halfway through instead of after expiry", () => {
    expect(activityRenewalDelayMs(4 * 60)).toBe(2 * 60 * 1_000);
    expect(activityRenewalDelayMs(60)).toBe(30_000);
  });

  it("never schedules a renewal immediately", () => {
    expect(activityRenewalDelayMs(0)).toBe(10_000);
    expect(activityRenewalDelayMs(-5)).toBe(10_000);
  });
});

describe("activityRenewalRetryDelayMs", () => {
  it("backs off exponentially and caps at one minute", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(activityRenewalRetryDelayMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000
    ]);
  });
});

describe("ActivitySessionRenewer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function sessionSequence(...results: Array<RenewedActivitySession | Error>) {
    const renewSession = vi.fn(async () => {
      const next = results.shift();

      if (!next || next instanceof Error) {
        throw next ?? new Error("no more sessions");
      }

      return next;
    });

    return renewSession;
  }

  it("keeps the initial token until the scheduled renewal fires", async () => {
    const renewSession = sessionSequence({ token: "second", expiresIn: 3_600 });
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession
    });

    await vi.advanceTimersByTimeAsync(55 * 60 * 1_000 - 1);
    expect(renewSession).not.toHaveBeenCalled();
    expect(renewer.getToken()).toBe("first");

    await vi.advanceTimersByTimeAsync(1);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(renewer.getToken()).toBe("second");
    renewer.dispose();
  });

  it("schedules the next renewal from the renewed session's lifetime", async () => {
    const renewSession = sessionSequence(
      { token: "second", expiresIn: 600 },
      { token: "third", expiresIn: 3_600 }
    );
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession
    });

    await vi.advanceTimersByTimeAsync(55 * 60 * 1_000);
    expect(renewer.getToken()).toBe("second");

    await vi.advanceTimersByTimeAsync(5 * 60 * 1_000);
    expect(renewSession).toHaveBeenCalledTimes(2);
    expect(renewer.getToken()).toBe("third");
    renewer.dispose();
  });

  it("retries failed renewals with backoff and keeps the old token meanwhile", async () => {
    const onRenewalError = vi.fn();
    const renewSession = sessionSequence(
      new Error("offline"),
      new Error("still offline"),
      { token: "second", expiresIn: 3_600 }
    );
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession,
      onRenewalError
    });

    await vi.advanceTimersByTimeAsync(55 * 60 * 1_000);
    expect(onRenewalError).toHaveBeenLastCalledWith(expect.any(Error), 1);
    expect(renewer.getToken()).toBe("first");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onRenewalError).toHaveBeenLastCalledWith(expect.any(Error), 2);

    await vi.advanceTimersByTimeAsync(3_999);
    expect(renewSession).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(renewSession).toHaveBeenCalledTimes(3);
    expect(renewer.getToken()).toBe("second");
    renewer.dispose();
  });

  it("shares one in-flight renewal between concurrent callers", async () => {
    let resolveSession: (session: RenewedActivitySession) => void = () => undefined;
    const renewSession = vi.fn(
      () =>
        new Promise<RenewedActivitySession>((resolve) => {
          resolveSession = resolve;
        })
    );
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession
    });

    const first = renewer.renew();
    const second = renewer.renew();
    resolveSession({ token: "second", expiresIn: 3_600 });

    await expect(Promise.all([first, second])).resolves.toEqual(["second", "second"]);
    expect(renewSession).toHaveBeenCalledTimes(1);
    renewer.dispose();
  });

  it("resets the schedule after an on-demand renewal", async () => {
    const renewSession = sessionSequence(
      { token: "second", expiresIn: 3_600 },
      { token: "third", expiresIn: 3_600 }
    );
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession
    });

    await vi.advanceTimersByTimeAsync(30 * 60 * 1_000);
    await renewer.renew();

    await vi.advanceTimersByTimeAsync(55 * 60 * 1_000 - 1);
    expect(renewSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(renewSession).toHaveBeenCalledTimes(2);
    expect(renewer.getToken()).toBe("third");
    renewer.dispose();
  });

  it("stops renewing once disposed", async () => {
    const renewSession = sessionSequence({ token: "second", expiresIn: 3_600 });
    const renewer = new ActivitySessionRenewer({
      session: { token: "first", expiresIn: 3_600 },
      renewSession
    });

    renewer.dispose();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1_000);

    expect(renewSession).not.toHaveBeenCalled();
    await expect(renewer.renew()).resolves.toBeUndefined();
    expect(renewer.getToken()).toBe("first");
  });
});

describe("fetchWithActivityRenewal", () => {
  function fakeAuth(tokens: { current: string; renewed?: string }): ActivityAuth & {
    renew: ReturnType<typeof vi.fn>;
  } {
    return {
      getToken: () => tokens.current,
      renew: vi.fn(async () => {
        if (!tokens.renewed) return undefined;
        tokens.current = tokens.renewed;
        return tokens.renewed;
      })
    };
  }

  it("does not renew when the first request succeeds", async () => {
    const auth = fakeAuth({ current: "first", renewed: "second" });
    const request = vi.fn(async () => new Response(null, { status: 200 }));

    const response = await fetchWithActivityRenewal(auth, request);

    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledExactlyOnceWith("first");
    expect(auth.renew).not.toHaveBeenCalled();
  });

  it("renews and retries once after a 401", async () => {
    const auth = fakeAuth({ current: "first", renewed: "second" });
    const request = vi.fn(async (token: string | undefined) =>
      new Response(null, { status: token === "second" ? 200 : 401 })
    );

    const response = await fetchWithActivityRenewal(auth, request);

    expect(response.status).toBe(200);
    expect(request.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("returns the 401 when renewal fails", async () => {
    const auth = fakeAuth({ current: "first" });
    const request = vi.fn(async () => new Response(null, { status: 401 }));

    const response = await fetchWithActivityRenewal(auth, request);

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sends cookie-authenticated web requests once without renewal", async () => {
    const request = vi.fn(async () => new Response(null, { status: 401 }));

    const response = await fetchWithActivityRenewal(undefined, request);

    expect(response.status).toBe(401);
    expect(request).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
