import React from "react";

/**
 * Renders the lightweight markdown dialect used by blog posts
 * (## headings, -/1. lists, | tables, **bold**). Server-safe: no hooks.
 */
export default function BlogPostBody({ content }: { content: string }) {
  return <div style={{ color: "var(--text-primary)", fontSize: "15px" }}>{renderContent(content)}</div>;
}

function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const Tag = listType === "ul" ? "ul" : "ol";
      elements.push(
        <Tag key={key++} style={{ margin: "12px 0", paddingLeft: "20px" }}>
          {listItems.map((item, li) => (
            <li key={li} style={{ marginBottom: "6px", color: "var(--text-secondary)", lineHeight: 1.6 }}>{item}</li>
          ))}
        </Tag>
      );
      listItems = [];
      listType = null;
    }
  };

  const flushTable = () => {
    if (tableRows.length > 0) {
      const rows = tableRows.filter(r => r.trim() && !r.match(/^\|[-| ]+$/));
      elements.push(
        <div key={key++} style={{ overflowX: "auto", margin: "16px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split("|").filter(c => c.trim());
                return (
                  <tr key={ri} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    {cells.map((cell, ci) => (
                      ri === 0 ?
                        <th key={ci} style={{ padding: "8px 12px", textAlign: "left", color: "var(--color-purple)", fontWeight: 700, background: "rgba(155,81,224,0.05)" }}>{cell.trim()}</th> :
                        <td key={ci} style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{cell.trim()}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("|")) {
      flushList();
      tableRows.push(trimmed);
      continue;
    }

    flushTable();

    if (trimmed.startsWith("- ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(trimmed.replace(/^- /, ""));
      continue;
    }

    if (trimmed.match(/^\d+\./)) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(trimmed.replace(/^\d+\.\s*/, ""));
      continue;
    }

    flushList();

    if (trimmed.startsWith("## ")) {
      elements.push(<h2 key={key++} style={{ fontSize: "18px", fontWeight: 700, marginTop: "28px", marginBottom: "12px", color: "var(--color-cyan)" }}>{trimmed.replace("## ", "")}</h2>);
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
      elements.push(<p key={key++} style={{ fontWeight: 700, color: "var(--text-primary)", margin: "12px 0" }}>{trimmed.replace(/\*\*/g, "")}</p>);
    } else if (trimmed.length > 0) {
      const withBold = trimmed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      elements.push(
        <p
          key={key++}
          style={{ margin: "12px 0", color: "var(--text-secondary)", lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: withBold }}
        />
      );
    }
  }
  flushList();
  flushTable();
  return elements;
}
