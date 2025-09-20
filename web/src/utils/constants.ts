// Don't render markdown in the frontend if the content exceeds the character count
// react-markdown is unfortunately too slow to bear this for now.
export const MARKDOWN_RENDER_CHARACTER_LIMIT = 150000;
