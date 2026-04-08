import { marked } from "marked";
// @ts-expect-error marked-terminal v7 lacks type declarations
import { markedTerminal } from "marked-terminal";

marked.use(markedTerminal());

/**
 * Auto-close unclosed Markdown constructs so incomplete streaming text
 * can still be rendered without garbled output.
 */
function closeUnclosed(text: string): string {
  let result = text;

  const fenceMatches = result.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    result += "\n```";
  }

  const backtickSplit = result.split("```");
  const outside: string[] = [];
  for (let i = 0; i < backtickSplit.length; i += 2) {
    outside.push(backtickSplit[i] ?? "");
  }
  const prose = outside.join("");

  const bolds = prose.match(/\*\*/g);
  if (bolds && bolds.length % 2 !== 0) {
    result += "**";
  }

  const italicCount = (prose.match(/(?<!\*)\*(?!\*)/g) || []).length;
  if (italicCount % 2 !== 0) {
    result += "*";
  }

  return result;
}

export function renderMarkdown(text: string): string {
  try {
    const rendered = marked.parse(text) as string;
    return rendered.trimEnd();
  } catch {
    return text;
  }
}

export function renderStreamingMarkdown(text: string): string {
  try {
    const closed = closeUnclosed(text);
    const rendered = marked.parse(closed) as string;
    return rendered.trimEnd();
  } catch {
    return text;
  }
}
