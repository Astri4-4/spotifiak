import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import App from "./App";
import "./index.css";

// Light status bar icons on the dark UI (capacitor.config.ts sets this for
// Android at launch; iOS needs it set at runtime).
if (Capacitor.isNativePlatform()) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => void 0);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
