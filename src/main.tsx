import React from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "@/lib/theme";
import App from "./App";
import "./index.css";

initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
