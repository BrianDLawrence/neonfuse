import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Neon Fuse",
  description: "The terms that govern use of the Neon Fuse game and Discord Activity."
};

export default function TermsPage() {
  return (
    <LegalPage
      activePath="/terms"
      intro="These terms govern your access to the Neon Fuse website, Discord Activity, multiplayer service, and related features."
      kicker="Neon Fuse // Arena Rules"
      title="Terms of Service"
    >
      <LegalSection id="agreement" title="1. Agreement and eligibility">
        <p>
          By accessing or using Neon Fuse, you agree to these Terms. If you do not
          agree, do not use the service. You must meet Discord&apos;s minimum age and any
          higher minimum age required where you live. If you use Neon Fuse for an
          organization, you confirm that you are authorized to accept these Terms for it.
        </p>
      </LegalSection>

      <LegalSection id="accounts" title="2. Discord accounts">
        <p>
          Neon Fuse uses Discord to authenticate players. You are responsible for your
          Discord account and for activity performed through it. Do not share session
          links or tokens, impersonate another player, or attempt to access another
          player&apos;s data. Discord&apos;s own terms and policies also apply to your use of
          Discord.
        </p>
      </LegalSection>

      <LegalSection id="license" title="3. Permission to use Neon Fuse">
        <p>
          Spero Autem LLC grants you a limited, personal, non-exclusive,
          non-transferable, revocable permission to use Neon Fuse for lawful
          entertainment. Except where an applicable open-source license says otherwise,
          you may not copy, sell, sublicense, reverse engineer, exploit, or create a
          competing service from Neon Fuse or its protected content.
        </p>
      </LegalSection>

      <LegalSection id="conduct" title="4. Acceptable use">
        <p>You may not use Neon Fuse to:</p>
        <ul>
          <li>Break the law, Discord&apos;s rules, or another person&apos;s rights.</li>
          <li>Harass, threaten, deceive, or impersonate another person.</li>
          <li>Cheat, automate play, manipulate results, or abuse leaderboards.</li>
          <li>
            Probe, disrupt, overload, bypass, or gain unauthorized access to the game,
            its API, multiplayer service, or another account.
          </li>
          <li>Upload malicious, infringing, or otherwise unlawful material.</li>
        </ul>
      </LegalSection>

      <LegalSection id="game-data" title="5. Results, progression, and submitted content">
        <p>
          Scores, rankings, achievements, and match history are game features, not
          property or currency, and have no cash value. We may correct or remove results
          affected by bugs, cheating, abuse, or a player&apos;s data-deletion request.
        </p>
        <p>
          If a feature lets you submit a custom music track or other content, you keep
          your rights in it and give us a worldwide, non-exclusive permission to host,
          reproduce, and display it only as needed to operate and improve that feature.
          You confirm that you have the rights needed to submit it. Contact{" "}
          <Link href="/support">Support</Link> to request removal of submitted content.
        </p>
      </LegalSection>

      <LegalSection id="availability" title="6. Service changes and enforcement">
        <p>
          Neon Fuse is an evolving game. We may change, suspend, or discontinue features;
          reset game data when reasonably necessary; or restrict access to protect users,
          comply with law, or enforce these Terms. We will try to avoid unnecessary
          disruption, but we do not promise that every feature will always be available.
        </p>
      </LegalSection>

      <LegalSection id="third-parties" title="7. Third-party services">
        <p>
          Neon Fuse depends on Discord and other hosting or infrastructure providers.
          Their services and terms are outside our control. Links to third-party sites do
          not mean that we endorse or control those sites.
        </p>
      </LegalSection>

      <LegalSection id="warranty" title="8. Disclaimers">
        <p>
          To the fullest extent permitted by law, Neon Fuse is provided &quot;as is&quot; and &quot;as
          available.&quot; We disclaim implied warranties of merchantability, fitness for a
          particular purpose, non-infringement, and uninterrupted or error-free operation.
          Nothing in these Terms excludes rights that cannot legally be excluded.
        </p>
      </LegalSection>

      <LegalSection id="liability" title="9. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Spero Autem LLC and its affiliates will
          not be liable for indirect, incidental, special, consequential, exemplary, or
          punitive damages, or for lost data, profits, goodwill, or use arising from Neon
          Fuse. These limits do not apply where the law does not allow them.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes and contact">
        <p>
          We may update these Terms as the service changes. Continued use after updated
          Terms take effect means you accept them. If a change requires additional notice
          or consent under applicable law, we will provide it. Questions can be sent
          through the <Link href="/support">Support page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
