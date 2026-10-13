import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { initTheme } from "@/lib/theme";
import { initUpdates } from "@/lib/updates";
import App from "./App";
import "./index.css";

// The mobile apps don't zoom, like native apps (pinch, or into a focused
// field). Browsers keep pinch-zoom, which people may need to read.
if (Capacitor.isNativePlatform()) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover");
}

initTheme();
initUpdates();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
