import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Neon Fuse",
  description: "How Neon Fuse collects, uses, retains, and deletes player data."
};

export default function PrivacyPage() {
  return (
    <LegalPage
      activePath="/privacy"
      intro="This policy explains what Neon Fuse receives from Discord, what the game stores, why we use it, and how you can remove it."
      kicker="Neon Fuse // Data Protocol"
      title="Privacy Policy"
    >
      <LegalSection id="scope" title="1. Who operates Neon Fuse">
        <p>
          Neon Fuse is operated by Spero Autem LLC (&quot;Neon Fuse,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;). This policy applies to the Neon Fuse website, Discord Activity,
          multiplayer service, and related support channels.
        </p>
      </LegalSection>

      <LegalSection id="data" title="2. Data we collect">
        <h3>Discord and account data</h3>
        <ul>
          <li>Your Discord user ID, display name, and avatar.</li>
          <li>
            OAuth and Activity session data needed to authenticate you, including a
            short-lived Neon Fuse Activity session token.
          </li>
          <li>
            Activity instance and connected-participant identifiers needed to show
            the current party and start a match. We do not store Discord message
            content, server messages, voice, contacts, or your Discord password.
          </li>
        </ul>

        <h3>Game and profile data</h3>
        <ul>
          <li>
            An internal player ID, profile settings, equipped title, progression,
            achievements, and audio or bot preferences.
          </li>
          <li>
            Match results, scores, leaderboard entries, duel participants, match
            duration, and gameplay statistics.
          </li>
          <li>
            A random visitor ID stored in your browser and a cookie so a saved match
            can be connected to the same play session.
          </li>
        </ul>

        <h3>Technical data</h3>
        <p>
          Our authentication, hosting, and security providers may process standard
          connection data such as IP address, browser or device information,
          timestamps, and error or security logs. Your browser also stores your
          selected music track and visitor ID locally.
        </p>
      </LegalSection>

      <LegalSection id="uses" title="3. How we use data">
        <ul>
          <li>Authenticate your Discord identity and maintain a secure session.</li>
          <li>Operate local and multiplayer matches and display your current party.</li>
          <li>Save preferences, progression, match history, and leaderboards.</li>
          <li>Detect abuse, investigate failures, secure the service, and provide support.</li>
          <li>
            Improve game balance and reliability using aggregate or de-identified
            information.
          </li>
        </ul>
        <p>
          We do not sell Discord API data, use it for targeted advertising, or use
          Discord message content to train artificial intelligence models.
        </p>
      </LegalSection>

      <LegalSection id="sharing" title="4. When data is shared">
        <p>We share data only as needed to operate Neon Fuse with these providers:</p>
        <ul>
          <li>
            <strong>Discord</strong> for identity, OAuth, Activity, and platform services.
          </li>
          <li>
            <strong>MongoDB Atlas</strong> for production account and game-data storage.
          </li>
          <li>
            <strong>Vercel</strong> for the web application and API hosting.
          </li>
          <li>
            <strong>Render</strong> for the realtime multiplayer service.
          </li>
        </ul>
        <p>
          We may also disclose information when required by law or when reasonably
          necessary to protect users, the service, or our legal rights. We do not
          share Discord API data with data brokers or advertising networks.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="5. Retention and deletion">
        <ul>
          <li>Neon Fuse Activity sessions expire within one hour.</li>
          <li>
            Browser visitor cookies expire after one year, while local browser data
            remains until you clear it or use the deletion control described below.
          </li>
          <li>
            Profiles, matches, duels, scores, and account records remain while you use
            the service, unless you delete them.
          </li>
          <li>
            Security logs and provider backups may remain for a limited period under
            the applicable provider&apos;s security and backup schedule.
          </li>
        </ul>
        <p>
          To delete your Neon Fuse account data, open <strong>Fighter Profile</strong>,
          find <strong>Data Controls</strong>, and choose <strong>Delete account data</strong>.
          After you type the confirmation phrase, Neon Fuse deletes the linked profile,
          match history, leaderboard entries, visitor record, duel records, Activity
          sessions, and authentication records from active storage. The game also
          clears its visitor and music choices from that browser.
        </p>
        <p>
          If you cannot access the in-game control, use the options on our{" "}
          <Link href="/support">Support page</Link> without posting private account
          information in a public issue.
        </p>
      </LegalSection>

      <LegalSection id="choices" title="6. Your choices">
        <ul>
          <li>Delete your Neon Fuse data through the self-service profile control.</li>
          <li>Revoke Neon Fuse from Discord&apos;s Authorized Apps settings.</li>
          <li>Clear the site&apos;s cookies and local storage in your browser.</li>
          <li>
            Ask support to help you access, correct, or delete account-linked data.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="7. Security and international processing">
        <p>
          We use access controls, short-lived Activity sessions, hashed session tokens,
          transport encryption, and production providers configured to encrypt stored
          service data at rest. No system is perfectly secure. Data may be processed in
          countries where our providers operate, subject to their contractual and legal
          safeguards.
        </p>
      </LegalSection>

      <LegalSection id="age" title="8. Age requirements">
        <p>
          Neon Fuse is not directed to children under 13. You must meet Discord&apos;s
          minimum age and any higher minimum age required in your country to use the
          service.
        </p>
      </LegalSection>

      <LegalSection id="updates" title="9. Changes and contact">
        <p>
          We may update this policy as Neon Fuse changes. We will revise the effective
          date above when updates are published. Privacy and support contact options are
          listed on the <Link href="/support">Support page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
