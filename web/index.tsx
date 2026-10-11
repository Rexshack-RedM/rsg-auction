import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// styles.css (including Tailwind's directives) is compiled separately by the
// `build:css` script via the Tailwind CLI into dist/index.css, and linked
// directly from index.html — it is not bundled through this JS entrypoint
// because esbuild's CSS loader doesn't understand @tailwind directives.
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);