// LFE-14544 — sandbox shell for AI-generated custom data views (demo spike).
//
// Served as a standalone HTML document so the embedding <iframe
// sandbox="allow-scripts"> gets an OPAQUE origin (no cookies, no parent DOM,
// no app storage) and so this response can carry its own Content-Security-
// Policy: the app-wide CSP in next.config.mjs excludes /api and would
// otherwise be inherited by an inline srcdoc frame and block the CDN scripts.
//
// The CSP below is the second sandbox layer: scripts only from jsdelivr +
// inline, and NO connect-src/img-src(http)/form-action — generated code
// cannot exfiltrate data even though it runs arbitrary JS.
//
// Protocol (postMessage, both directions tagged `source`):
//   parent -> frame: { type: "render", code, data, theme }
//   frame -> parent: { source: "custom-view-sandbox", type: "ready" | "rendered" | "error", message? }

import { type NextApiRequest, type NextApiResponse } from "next";

const SANDBOX_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--background, transparent);
    color: var(--foreground, inherit);
    font-family: var(--font-family, ui-sans-serif, system-ui, -apple-system, sans-serif);
    font-size: 13px;
    line-height: 1.45;
  }
  #root { padding: 10px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.4/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  function report(type, message) {
    parent.postMessage(
      { source: "custom-view-sandbox", type: type, message: message },
      "*"
    );
  }

  window.onerror = function (msg) {
    report("error", String(msg));
  };
  window.addEventListener("unhandledrejection", function (event) {
    report("error", String(event.reason));
  });

  if (
    typeof React === "undefined" ||
    typeof ReactDOM === "undefined" ||
    typeof Babel === "undefined"
  ) {
    report(
      "error",
      "Sandbox failed to load React/Babel from cdn.jsdelivr.net — is the network reachable?"
    );
    return;
  }

  // Catches render-phase throws of the generated component; re-keyed per
  // render request so a later successful generation clears the error state.
  class GeneratedViewBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { failed: false };
    }
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(error) {
      report("error", error && error.message ? error.message : String(error));
    }
    render() {
      return this.state.failed ? null : this.props.children;
    }
  }

  var root = null;
  var renderSeq = 0;

  window.addEventListener("message", function (event) {
    var payload = event.data;
    if (!payload || payload.type !== "render") return;
    try {
      if (payload.theme) {
        for (var key in payload.theme) {
          document.documentElement.style.setProperty(key, payload.theme[key]);
        }
      }
      var compiled = Babel.transform(payload.code, {
        presets: [["react"]],
        filename: "CustomView.jsx",
      }).code;
      var factory = new Function(
        "React",
        compiled +
          "\\n;return typeof CustomView === 'function' ? CustomView : null;"
      );
      var CustomView = factory(window.React);
      if (!CustomView) {
        throw new Error(
          "The generated code did not define a \`CustomView\` function component."
        );
      }
      if (!root) {
        root = ReactDOM.createRoot(document.getElementById("root"));
      }
      renderSeq += 1;
      root.render(
        React.createElement(
          GeneratedViewBoundary,
          { key: renderSeq },
          React.createElement(CustomView, { data: payload.data })
        )
      );
      report("rendered");
    } catch (error) {
      report("error", error && error.message ? error.message : String(error));
    }
  });

  report("ready");
})();
</script>
</body>
</html>`;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;",
  );
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(SANDBOX_HTML);
}
