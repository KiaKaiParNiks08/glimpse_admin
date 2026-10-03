import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Glimpsapp Admin",
  description: "Privacy Policy for Glimpsapp Admin",
};

export default function PrivacyPolicyPage() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem", lineHeight: 1.65 }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: March 26, 2026</p>

      <p>
        This Privacy Policy explains how Glimpsapp Admin collects, uses, and protects information
        when you use this website and related services.
      </p>

      <h2>Information We Collect</h2>
      <p>
        We may collect account details, usage information, device/browser data, and content you
        provide while using the platform.
      </p>

      <h2>How We Use Information</h2>
      <p>
        We use information to operate the service, improve performance, provide support, maintain
        security, and comply with legal obligations.
      </p>

      <h2>Data Sharing</h2>
      <p>
        We do not sell personal information. Data may be shared with trusted providers who help us
        run the service, or when required by law.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain information only as long as needed for service delivery, legal compliance, and
        legitimate business purposes.
      </p>

      <h2>Your Rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict
        processing of your personal information.
      </p>

      <h2>Security</h2>
      <p>
        We apply reasonable technical and organizational safeguards, but no system is completely
        secure.
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy, please contact the Glimpsapp team through official
        support channels.
      </p>
    </main>
  );
}
