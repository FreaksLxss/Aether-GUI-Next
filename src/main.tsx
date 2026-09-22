import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import { initSound } from "./lib/sound";

// Must run before React mounts: it reads the persisted mute/volume, applies them
// to cuelume, and binds the delegated data-cuelume-* listeners at document root.
// Outside React so StrictMode's double-invoke can never reach it.
initSound();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
