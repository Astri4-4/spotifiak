import React from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "@/lib/theme";
import { initUpdates } from "@/lib/updates";
import App from "./App";
import "./index.css";

initTheme();
initUpdates();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
