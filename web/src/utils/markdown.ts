export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Convert links to text
    .replace(/[*_~`#]/g, "") // Remove formatting characters
    .replace(/^>\s+/gm, "") // Remove blockquotes
    .replace(/^[-*+]\s+/gm, "") // Remove list markers
    .replace(/^\d+\.\s+/gm, "") // Remove numbered list markers
    .replace(/\n+/g, " ") // Replace newlines with spaces
    .trim();
}
