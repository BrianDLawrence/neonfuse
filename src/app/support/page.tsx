import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Support | Neon Fuse",
  description: "Help, data controls, and contact options for Neon Fuse players."
};

const GITHUB_ISSUES_URL = "https://github.com/BrianDLawrence/neonfuse/issues";

export default function SupportPage() {
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  const supportServerUrl = process.env.DISCORD_SUPPORT_URL?.trim();

  return (
    <LegalPage
      activePath="/support"
      intro="Start here for gameplay help, connection issues, account-data controls, or a way to reach the Neon Fuse team."
      kicker="Neon Fuse // Support Channel"
      title="Support"
    >
      <LegalSection id="contact" title="Contact support">
        <div className="support-actions">
          {supportServerUrl ? (
            <a className="command-button" href={supportServerUrl} rel="noreferrer" target="_blank">
              Join the support server
            </a>
          ) : null}
          {supportEmail ? (
            <a className="command-button secondary" href={`mailto:${supportEmail}`}>
              Email support
            </a>
          ) : null}
          <a
            className="command-button secondary"
            href={GITHUB_ISSUES_URL}
            rel="noreferrer"
            target="_blank"
          >
            Report a bug
          </a>
        </div>
        <p>
          GitHub issues are public. Never post your Discord user ID, email address,
          access token, session token, or other private information there. For a private
          account or privacy question, use email or the support server when shown above;
          otherwise open a public issue asking the team to provide a private contact
          channel, without including personal details.
        </p>
      </LegalSection>

      <LegalSection id="data-help" title="Delete or correct account data">
        <ol>
          <li>Open Neon Fuse and sign in through Discord.</li>
          <li>Open your Fighter Profile from the top-right controls.</li>
          <li>Scroll to Data Controls and choose Delete account data.</li>
          <li>Type the displayed confirmation phrase and confirm.</li>
        </ol>
        <p>
          This deletes account-linked data from active Neon Fuse storage and clears Neon
          Fuse&apos;s visitor and music choices from that browser. You can also revoke the
          application from Discord&apos;s Authorized Apps settings. If you need a correction
          instead, contact support and explain what is inaccurate without sending tokens
          or passwords.
        </p>
        <p>
          See the <Link href="/privacy">Privacy Policy</Link> for the complete data and
          retention description.
        </p>
      </LegalSection>

      <LegalSection id="troubleshooting" title="Connection troubleshooting">
        <ul>
          <li>
            <strong>Activity will not open:</strong> close and reopen the Activity, then
            check that Discord is current and your connection is stable.
          </li>
          <li>
            <strong>Profile says Local only:</strong> your current game can continue, but
            profile storage is temporarily unavailable. Retry after reconnecting.
          </li>
          <li>
            <strong>Friend match will not connect:</strong> both players should remain in
            the same Discord Activity instance while the realtime service reconnects.
          </li>
          <li>
            <strong>Audio is missing:</strong> interact with the game once, then check the
            Music and SFX controls in Admin or Fighter Profile.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="response" title="What to include in a report">
        <p>
          Include what you expected, what happened, the approximate time, your browser or
          Discord client, and steps that reproduce the problem. Screenshots are helpful if
          they do not expose personal data or tokens. Never send your Discord password.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
