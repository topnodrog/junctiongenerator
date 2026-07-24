"use client";

const RESOURCES = [
  {
    name: "Ledger",
    tagline: "Protect your keys",
    body: "A hardware wallet keeps private keys away from an internet-connected computer. Always buy directly and verify the device before moving funds.",
    cta: "Visit Ledger",
    url: "https://shop.ledger.com/?r=3b782b7b6543",
  },
  {
    name: "Koinly",
    tagline: "Make tax records manageable",
    body: "Koinly can bring wallet and exchange activity into one place and help prepare crypto tax reports. Review the result with a qualified tax professional.",
    cta: "Visit Koinly",
    url: "https://koinly.io/?via=9AA968EC&utm_source=affiliate",
  },
];

export default function PartnerLinks() {
  return (
    <div className="glass-container" style={{ padding: "40px" }}>
      <div style={{ marginBottom: "32px" }}>
        <span className="jg-eyebrow">Practical resources</span>
        <h2 style={{ fontSize: "28px", fontWeight: 800, margin: "10px 0" }}>
          Tools for safer participation
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", maxWidth: "560px" }}>
          Two services that can help with self-custody and record keeping. These
          are independent companies, not Junction Generator partners.
        </p>
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {RESOURCES.map((resource) => (
          <article
            key={resource.name}
            style={{
              display: "grid",
              gap: "10px",
              padding: "22px",
              borderRadius: "6px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <span className="jg-eyebrow">{resource.tagline}</span>
            <h3 style={{ fontSize: "20px", color: "var(--text-primary)" }}>{resource.name}</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>
              {resource.body}
            </p>
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="jg-text-link"
              style={{ marginTop: "6px" }}
            >
              {resource.cta} ↗
            </a>
          </article>
        ))}
      </div>

      <p style={{ marginTop: "22px", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.65 }}>
        Disclosure: these two links are affiliate links. Junction Generator may
        receive a commission at no extra cost to you. Inclusion is not a claim of
        partnership, endorsement, or guaranteed safety. Verify every destination
        before connecting a wallet or sending funds.
      </p>
    </div>
  );
}
