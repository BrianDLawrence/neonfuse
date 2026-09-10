"use client";

import { useEffect, useRef, useState } from "react";
import { GameShell } from "@/components/game/GameShell";
import { authClient } from "@/lib/auth-client";

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

export function AuthGate() {
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
