import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { initTelegram } from "@/app/telegram";
import { initSync } from "@/store/sync";
import "./index.css";

initTelegram();
initSync();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
