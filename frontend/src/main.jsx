import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { RealtimeProvider } from "./context/RealtimeContext";
import { CallProvider } from "./context/CallContext";
import "./styles/design-system.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* VITE_HASH_ROUTER=1 for static hosting without SPA fallback (previews) */}
    {import.meta.env.VITE_HASH_ROUTER ? (
      <HashRouter>
        <AppProvider>
          <RealtimeProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </RealtimeProvider>
        </AppProvider>
      </HashRouter>
    ) : (
      <BrowserRouter>
        <AppProvider>
          <RealtimeProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </RealtimeProvider>
        </AppProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
