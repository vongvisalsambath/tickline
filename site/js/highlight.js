// A tiny syntax highlighter for the code samples (JS, HTML, CSS and Razor are close enough for this).
const KW = "import|from|export|const|let|var|function|return|async|await|new|if|else|for|of|class|implements|private|constructor|this|true|false|null|protected|override|bool|var|string";
const RE = new RegExp(`(//[^\\n]*|<!--[\\s\\S]*?-->|@\\*[\\s\\S]*?\\*@|/\\*[\\s\\S]*?\\*/)|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|\\b(${KW})\\b|\\b(\\d[\\d_]*(?:\\.\\d+)?)\\b|(&lt;\\/?[a-z][\\w-]*|\\/?&gt;)|(--tl-[a-z-]+)`, "g");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Highlights a <code> element in place. */
export function highlight(el) {
  const src = esc(el.textContent);
  el.innerHTML = src.replace(RE, (m, c, s, k, n, tag, v) =>
    c ? `<span class="tok-c">${m}</span>` : s ? `<span class="tok-s">${m}</span>` : k ? `<span class="tok-k">${m}</span>`
      : n ? `<span class="tok-n">${m}</span>` : tag ? `<span class="tok-t">${m}</span>` : v ? `<span class="tok-a">${m}</span>` : m);
}
