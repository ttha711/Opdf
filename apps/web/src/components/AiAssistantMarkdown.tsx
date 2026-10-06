import React from "react";

function formatInline(str: string) {
  const splitBold = str.split(/\*\*(.*?)\*\*/g);
  return splitBold.map((part, index) => {
    if (index % 2 === 1) return <strong key={index}>{part}</strong>;
    const splitCode = part.split(/`(.*?)`/g);
    return splitCode.map((subPart, subIndex) =>
      subIndex % 2 === 1
        ? <code key={subIndex} className="ai-inline-code">{subPart}</code>
        : subPart
    );
  });
}

function renderTable(key: string, headers: string[], rows: string[][]) {
  return (
    <div key={key} className="ai-table-container">
      <table className="ai-markdown-table">
        <thead>
          <tr>{headers.map((h, idx) => <th key={idx}>{formatInline(h)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => <td key={cIdx}>{formatInline(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownMessage({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (line.startsWith("|")) {
      inTable = true;
      const cells = line
        .split("|")
        .map((cell) => cell.trim())
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (line.includes("---")) continue;
      if (tableHeaders.length === 0) tableHeaders = cells;
      else tableRows.push(cells);
      continue;
    }

    if (inTable) {
      if (tableHeaders.length > 0) {
        elements.push(renderTable(`table-${i}`, tableHeaders, tableRows));
      }
      inTable = false;
      tableHeaders = [];
      tableRows = [];
    }

    if (line.startsWith("###")) {
      elements.push(<h4 key={i} className="ai-markdown-h4">{formatInline(line.replace(/^###\s*/, ""))}</h4>);
    } else if (line.startsWith("##")) {
      elements.push(<h2 key={i} className="ai-markdown-h2">{formatInline(line.replace(/^##\s*/, ""))}</h2>);
    } else if (line.startsWith("#")) {
      elements.push(<h2 key={i} className="ai-markdown-h2">{formatInline(line.replace(/^#\s*/, ""))}</h2>);
    } else if (line.startsWith("-") || line.startsWith("•") || line.startsWith("*")) {
      elements.push(<li key={i} className="ai-markdown-li">{formatInline(line.replace(/^[-•*]\s*/, ""))}</li>);
    } else if (line === "") {
      elements.push(<div key={i} style={{ height: "4px" }} />);
    } else {
      elements.push(<p key={i} className="ai-markdown-p">{formatInline(line)}</p>);
    }
  }

  if (inTable && tableHeaders.length > 0) {
    elements.push(renderTable("table-end", tableHeaders, tableRows));
  }

  return <div className="ai-markdown-body">{elements}</div>;
}
