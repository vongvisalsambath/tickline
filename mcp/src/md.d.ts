// Markdown files are bundled as text by esbuild (and by the test setup).
declare module "*.md" {
  const text: string;
  export default text;
}
