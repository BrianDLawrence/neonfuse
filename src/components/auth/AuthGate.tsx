"use client";

import {
  DiscordSDK,
  Events,
  RPCCloseCodes,
  type EventPayloadData
} from "@discord/embedded-app-sdk";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GameShell } from "@/components/game/GameShell";
import { authClient } from "@/lib/auth-client";

type ActivityLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      accountName: string;
      sessionToken: string;
      participantCount: number;
    };

interface ActivitySessionResponse {
  accessToken?: string;
  sessionToken?: string;
  player?: { displayName: string };
  error?: string;
}

function AuthStatus({ message }: Readonly<{ message: string }>) {
  return (
    <main className="auth-gate">
      <section className="auth-panel" aria-live="polite">
        <div className="auth-mark" aria-hidden="true">
          NF
        </div>
        <p className="auth-kicker">Neon Fuse // Identity Link</p>
        <h1>Syncing fighter profile</h1>
        <p className="auth-copy">{message}</p>
        <div className="auth-scanline" aria-hidden="true" />
      </section>
    </main>
  );
}

function ActivityErrorGate({ message }: Readonly<{ message: string }>) {
  return (
    <main className="auth-gate">
      <section className="auth-panel" aria-labelledby="activity-error-title">
        <div className="auth-mark" aria-hidden="true">
          NF
        </div>
        <p className="auth-kicker">Neon Fuse // Discord Activity</p>
        <h1 id="activity-error-title">Link interrupted</h1>
        <p className="auth-error" role="alert">
          {message}
        </p>
        <button
          className="command-button auth-discord-button"
          onClick={() => window.location.reload()}
          type="button"
        >
          Retry connection
        </button>
      </section>
    </main>
  );
}

function SignInGate({ error }: Readonly<{ error?: string }>) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [working, setWorking] = useState(false);
  const [signInError, setSignInError] = useState<string | undefined>(error);

  useEffect(() => {
    if (!working) {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [working]);

  async function signIn() {
    setWorking(true);
    setSignInError(undefined);

    const result = await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/"
    });

    if (result.error) {
      setWorking(false);
      setSignInError(result.error.message || "Discord sign-in failed.");
    }
  }

  return (
    <main className="auth-gate">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-mark" aria-hidden="true">
          NF
        </div>
        <p className="auth-kicker">Neon Fuse // Player Link</p>
        <h1 id="auth-title">Enter the arena</h1>
        <p className="auth-copy">
          Connect Discord to keep your player identity and match history tied to you.
        </p>
        {signInError ? (
          <p className="auth-error" role="alert">
            {signInError}
          </p>
        ) : null}
        <button
          ref={buttonRef}
          className="command-button auth-discord-button"
          disabled={working}
          onClick={() => void signIn()}
          type="button"
        >
          {working ? "Contacting Discord…" : "Continue with Discord"}
        </button>
        <p className="auth-footnote">Discord confirms your identity. Neon Fuse never receives your password.</p>
      </section>
    </main>
  );
}

function WebAuthGate() {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) {
    return <AuthStatus message="Checking your Discord session…" />;
  }

  if (!session) {
    return <SignInGate error={error?.message} />;
  }

  return (
    <GameShell
      accountName={session.user.name || session.user.email}
      onSignOut={async () => {
        await authClient.signOut();
        window.location.reload();
      }}
    />
  );
}

function DiscordActivityAuthGate() {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const [activityState, setActivityState] = useState<ActivityLoadState>(() =>
    clientId
      ? { status: "loading" }
      : {
          status: "error",
          message: "NEXT_PUBLIC_DISCORD_CLIENT_ID is missing from this deployment."
        }
  );
  const sdkRef = useRef<DiscordSDK | null>(null);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    const activityClientId = clientId;
    let cancelled = false;
    let participantListener:
      | ((event: EventPayloadData<"ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE">) => void)
      | undefined;
    const sdk = new DiscordSDK(activityClientId);
    sdkRef.current = sdk;

    async function connect() {
      await sdk.ready();
      const { code } = await sdk.commands.authorize({
        client_id: activityClientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify"]
      });
      const response = await fetch("/api/activity/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, instanceId: sdk.instanceId })
      });
      const payload = (await response.json()) as ActivitySessionResponse;

      if (!response.ok || !payload.accessToken || !payload.sessionToken || !payload.player) {
        throw new Error(payload.error || "Discord Activity sign-in failed.");
      }

      await sdk.commands.authenticate({ access_token: payload.accessToken });
      const connected = await sdk.commands.getInstanceConnectedParticipants();

      if (cancelled) {
        return;
      }

      setActivityState({
        status: "ready",
        accountName: payload.player.displayName,
        sessionToken: payload.sessionToken,
        participantCount: connected.participants.length
      });

      participantListener = (event) => {
        if (cancelled) {
          return;
        }

        setActivityState((current) =>
          current.status === "ready"
            ? { ...current, participantCount: event.participants.length }
            : current
        );
      };
      await sdk.subscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, participantListener);
    }

    void connect().catch((error: unknown) => {
      if (cancelled) {
        return;
      }

      setActivityState({
        status: "error",
        message: error instanceof Error ? error.message : "Discord Activity sign-in failed."
      });
    });

    return () => {
      cancelled = true;

      if (participantListener) {
        void sdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, participantListener);
      }
    };
  }, [clientId]);

  if (activityState.status === "loading") {
    return <AuthStatus message="Opening a secure channel through Discord…" />;
  }

  if (activityState.status === "error") {
    return <ActivityErrorGate message={activityState.message} />;
  }

  const partyLabel = `Discord Party ${activityState.participantCount}`;

  return (
    <GameShell
      accountName={activityState.accountName}
      authToken={activityState.sessionToken}
      connectionLabel={partyLabel}
      onSignOut={async () => {
        sdkRef.current?.close(RPCCloseCodes.CLOSE_NORMAL, "Player exited Neon Fuse");
      }}
    />
  );
}

function isDiscordActivity(): boolean {
  const params = new URLSearchParams(window.location.search);

  return (
    window.location.hostname.endsWith(".discordsays.com") ||
    params.has("frame_id") ||
    params.has("instance_id")
  );
}

function subscribeToBrowserState() {
  return () => undefined;
}

export function AuthGate() {
  const hydrated = useSyncExternalStore(
    subscribeToBrowserState,
    () => true,
    () => false
  );

  if (!hydrated) {
    return <AuthStatus message="Detecting the launch environment…" />;
  }

  return isDiscordActivity() ? <DiscordActivityAuthGate /> : <WebAuthGate />;
}
