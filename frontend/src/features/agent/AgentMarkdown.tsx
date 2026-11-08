import { Fragment, createElement, useMemo, type ReactNode } from 'react';
import { marked, type MarkedToken, type Token } from 'marked';
import { safeWebsiteUrl } from '../../lib/links';
import { openExternal } from '../../lib/openExternal';

function decodeEntities(text: string): string {
  if (!/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/i.test(text)) return text;
  // Decode entities as text; escape literal tags before using the inert decoder.
  const decoder = document.createElement('textarea');
  decoder.innerHTML = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return decoder.value;
}

function renderTokens(tokens: Token[] | undefined, path: string): ReactNode {
  return tokens?.map((token, index) => {
    const key = `${path}-${index}`;
    return <Fragment key={key}>{renderToken(token, key)}</Fragment>;
  });
}

function renderToken(token: Token, path: string): ReactNode {
  const node = token as MarkedToken;
  switch (node.type) {
    case 'space':
    case 'def': return null;
    case 'text': return node.tokens ? renderTokens(node.tokens, path) : decodeEntities(node.text);
    case 'escape': return node.text;
    case 'paragraph': return <p>{renderTokens(node.tokens, path)}</p>;
    case 'heading': return createElement(`h${node.depth}`, null, renderTokens(node.tokens, path));
    case 'strong': return <strong>{renderTokens(node.tokens, path)}</strong>;
    case 'em': return <em>{renderTokens(node.tokens, path)}</em>;
    case 'del': return <del>{renderTokens(node.tokens, path)}</del>;
    case 'br': return <br />;
    case 'hr': return <hr />;
    case 'codespan': return <code>{node.text}</code>;
    case 'code': return <pre tabIndex={0} aria-label={node.lang ? `${node.lang} code` : 'Code'} className="font-mono"><code>{node.text}</code></pre>;
    case 'blockquote': return <blockquote>{renderTokens(node.tokens, path)}</blockquote>;
    case 'checkbox': return <input type="checkbox" checked={node.checked} disabled aria-label={node.checked ? 'Completed task' : 'Pending task'} />;
    case 'list': {
      const items = node.items.map((item, index) => <li key={`${path}-item-${index}`} className={item.task ? 'list-none' : undefined}>{renderTokens(item.tokens, `${path}-item-${index}`)}</li>);
      return node.ordered ? <ol start={typeof node.start === 'number' ? node.start : undefined}>{items}</ol> : <ul>{items}</ul>;
    }
    case 'list_item': return <li>{renderTokens(node.tokens, path)}</li>;
    case 'link':
    case 'image': {
      const href = safeWebsiteUrl(decodeEntities(node.href));
      const label = renderTokens(node.tokens, path) || decodeEntities(node.text);
      // Images remain descriptive links, avoiding automatic remote requests.
      return href ? <a href={href} title={node.title ? decodeEntities(node.title) : undefined} target="_blank" rel="noopener noreferrer" onClick={openExternal}>{label}</a> : <span>{label}</span>;
    }
    case 'table': return <div data-agent-markdown-table className="agent-markdown-table rounded-sm border border-outline-variant" role="region" aria-label="Table" tabIndex={0}>
      <table className="border-hidden">
        <thead><tr>{node.header.map((cell, index) => <th key={`${path}-head-${index}`} scope="col" style={{ textAlign: cell.align || undefined }}>{renderTokens(cell.tokens, `${path}-head-${index}`)}</th>)}</tr></thead>
        <tbody>{node.rows.map((row, rowIndex) => <tr key={`${path}-row-${rowIndex}`}>{row.map((cell, columnIndex) => <td key={`${path}-${rowIndex}-${columnIndex}`} style={{ textAlign: cell.align || undefined }}>{renderTokens(cell.tokens, `${path}-${rowIndex}-${columnIndex}`)}</td>)}</tr>)}</tbody>
      </table>
    </div>;
    case 'html':
      if (/^<br\s*\/?>$/i.test(node.text)) return <br />;
      return node.block ? <pre tabIndex={0} aria-label="HTML source" className="font-mono"><code>{node.text}</code></pre> : node.text;
    default: return token.raw;
  }
}

/** Render parsed Markdown as React nodes, never injecting provider HTML.
 *  Typography comes from the tokenized `.md-body` (index.css): code and tables sit on `--sunk`
 *  with outline-variant borders in the mono face, each inside its own horizontal scroll area. */
export function AgentMarkdown({ content }: { content: string }) {
  const rendered = useMemo(() => {
    try {
      return renderTokens(marked.lexer(content, { gfm: true, breaks: true }), 'reply');
    } catch {
      return <p className="whitespace-pre-wrap break-words">{content}</p>;
    }
  }, [content]);
  return <div className="md-body agent-markdown min-w-0">{rendered}</div>;
}
