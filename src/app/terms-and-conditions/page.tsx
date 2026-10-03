import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Conditions | Glimpsapp Admin",
  description: "Terms and Conditions for Glimpsapp Admin",
};

export default function TermsAndConditionsPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.65 }}>
      <h1>Terms &amp; Conditions</h1>
      <p>Last updated: March 25, 2026</p>

      <p>
        These Terms &amp; Conditions govern your use of Glimpsapp Admin. By using the service, you
        agree to these terms.
      </p>

      <h2>Use of Service</h2>
      <p>
        You agree to use the service lawfully and responsibly. You are responsible for all activity
        under your account.
      </p>

      <h2>Account Responsibilities</h2>
      <p>
        You must keep your login credentials secure and promptly report unauthorized access or
        suspected breaches.
      </p>

      <h2>Acceptable Conduct</h2>
      <p>
        You may not misuse the platform, attempt unauthorized access, interfere with service
        operations, or violate applicable laws.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        All platform content, branding, and software are owned by Glimpsapp or its licensors unless
        otherwise stated.
      </p>

      <h2>Disclaimer and Limitation of Liability</h2>
      <p>
        The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To
        the maximum extent permitted by law, liability is limited for indirect or consequential
        damages.
      </p>

      <h2>Changes to Terms</h2>
      <p>
        We may update these terms from time to time. Continued use after updates means you accept
        the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about these terms, contact the Glimpsapp team through official
        support channels.
      </p>
    </main>
  );
}
