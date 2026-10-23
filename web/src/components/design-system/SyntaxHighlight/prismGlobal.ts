import { Prism } from "prism-react-renderer";

// Grammar files in `prismjs/components` attach themselves to a global `Prism`.
(globalThis as { Prism?: typeof Prism }).Prism = Prism;
