"use client";

/**
 * Safe lightweight rich-text: renders a markdown-ish subset WITHOUT
 * dangerouslySetInnerHTML (React elements only — XSS-safe by construction).
 */
import * as React from "react";
import { cn } from "@/lib/utils";

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // tokens: `code`, **bold**, *italic*, [text](url), @mention, plain
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(@[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|@[a-zA-Z0-9_-]{2,32})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("`")) {
      nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("[")) {
      const mm = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(tok)!;
      nodes.push(
        <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer nofollow">
          {mm[1]}
        </a>,
      );
    } else if (tok.startsWith("@")) {
      nodes.push(
        <span key={key} className="rounded bg-primary-soft px-1 py-0.5 font-medium text-primary">
          {tok}
        </span>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let ordered = false;
  let codeLines: string[] | null = null;
  let paragraph: string[] = [];

  const flushParagraph = (k: number) => {
    if (paragraph.length) {
      blocks.push(<p key={`p-${k}`}>{renderInline(paragraph.join(" "), `p${k}`)}</p>);
      paragraph = [];
    }
  };
  const flushList = (k: number) => {
    if (listItems.length) {
      const items = listItems.map((li, idx) => (
        <li key={idx}>{renderInline(li, `li${k}-${idx}`)}</li>
      ));
      blocks.push(
        ordered ? <ol key={`ol-${k}`}>{items}</ol> : <ul key={`ul-${k}`}>{items}</ul>,
      );
      listItems = [];
    }
  };

  let key = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (codeLines !== null) {
      if (line.startsWith("```")) {
        blocks.push(
          <pre key={`pre-${key}`}>
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = null;
        key++;
      } else {
        codeLines.push(raw);
      }
      continue;
    }
    if (line.startsWith("```")) {
      flushParagraph(key++);
      flushList(key++);
      codeLines = [];
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(key++);
      flushList(key++);
      const level = heading[1]!.length;
      const content = renderInline(heading[2]!, `h${key}`);
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${key}`}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={`h-${key}`}>{content}</h2>
        ) : (
          <h3 key={`h-${key}`}>{content}</h3>
        ),
      );
      key++;
      continue;
    }
    const li = /^[-*]\s+(.*)$/.exec(line);
    const oli = /^\d+[.)]\s+(.*)$/.exec(line);
    if (li || oli) {
      flushParagraph(key++);
      const isOrdered = !!oli;
      if (listItems.length && isOrdered !== ordered) flushList(key++);
      ordered = isOrdered;
      listItems.push((li?.[1] ?? oli?.[1])!);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph(key++);
      flushList(key++);
      blocks.push(<blockquote key={`bq-${key}`}>{renderInline(line.replace(/^>\s?/, ""), `bq${key}`)}</blockquote>);
      key++;
      continue;
    }
    if (line.trim() === "") {
      flushParagraph(key++);
      flushList(key++);
      continue;
    }
    paragraph.push(line.trim());
  }
  if (codeLines !== null) {
    blocks.push(<pre key={`pre-${key}`}><code>{codeLines.join("\n")}</code></pre>);
  }
  flushParagraph(key++);
  flushList(key++);

  return <div className={cn("prose-compact text-sm text-foreground/90", className)}>{blocks}</div>;
}
