"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedHeaders } from "@/lib/authenticated-headers";
import type { DiscordPartyRoster } from "@/lib/player-profile-types";
import { ProfileAvatar } from "./ProfileScreen";

type DiscordPartyScreenProps = {
  authToken: string;
  participantCount: number;
  onClose: () => void;
  onInviteFriends: () => Promise<void>;
  onStartDuel: () => void;
};

type PartyStatus = "loading" | "ready" | "error";

export function DiscordPartyScreen({
  authToken,
  participantCount,
  onClose,
  onInviteFriends,
  onStartDuel
}: Readonly<DiscordPartyScreenProps>) {
  const [roster, setRoster] = useState<DiscordPartyRoster | null>(null);
  const [status, setStatus] = useState<PartyStatus>("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const loadRoster = useCallback(async () => {
    setStatus("loading");

    try {
      const response = await fetch("/api/social/party", {
        headers: authenticatedHeaders(authToken),
        cache: "no-store"
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        roster?: DiscordPartyRoster;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.roster) {
        throw new Error(payload.error ?? "Party roster unavailable");
      }

      setRoster(payload.roster);
      setStatus("ready");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Party roster unavailable");
      setStatus("error");
    }
  }, [authToken]);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster, participantCount]);

  async function inviteFriends() {
    setInviting(true);
    setNotice(null);

    try {
      await onInviteFriends();
      setNotice("Discord invite opened.");
    } catch {
      setNotice("Invites are unavailable in this Discord context.");
    } finally {
      setInviting(false);
    }
  }

  const connectedCount = roster?.connectedCount ?? participantCount;

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="party-title"
        aria-modal="true"
        className="admin-dialog party-dialog"
        id="discord-party"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="party-title">Discord Party</h3>
            <div className="admin-panel-header-actions">
              <span>{connectedCount} connected</span>
              <button
                aria-label="Close Discord party"
                className="dialog-icon-button"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>

          <div className="dialog-scroll-region party-content" aria-live="polite">
            {roster?.members.length ? (
              <div className="party-roster">
                {roster.members.map((member, index) => (
                  <article
                    className="party-member"
                    data-current={member.isCurrentPlayer}
                    data-ready={member.profileReady}
                    key={`${member.displayName}-${index}`}
                  >
                    <ProfileAvatar avatarUrl={member.avatarUrl} name={member.displayName} />
                    <div className="party-member-identity">
                      <span>{member.isCurrentPlayer ? "You" : member.profileReady ? "Connected" : "Syncing"}</span>
                      <h4>{member.displayName}</h4>
                      <p>{member.title} · Level {member.level}</p>
                    </div>
                    <div className="party-member-record">
                      <span>Verified duel</span>
                      <strong>{member.duel.wins}-{member.duel.losses}-{member.duel.draws}</strong>
                      <small>{member.duel.played} played</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="party-state">
                {status === "loading" ? "Loading party roster…" : "No connected fighters found."}
              </p>
            )}

            {status === "error" ? (
              <button className="command-button secondary party-retry" onClick={() => void loadRoster()} type="button">
                Retry roster
              </button>
            ) : null}

            {notice ? <p className="party-notice" role="status">{notice}</p> : null}
          </div>

          <div className="party-actions">
            <button
              className="command-button secondary"
              disabled={inviting}
              onClick={() => void inviteFriends()}
              type="button"
            >
              {inviting ? "Opening Discord" : "Invite Friends"}
            </button>
            <button
              className="command-button"
              disabled={connectedCount < 2}
              onClick={onStartDuel}
              type="button"
            >
              Open Duel Lobby
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
