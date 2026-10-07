import React from "react";
import ReactDOM from "react-dom/client";
import { captureEmailAccessToken } from "./lib/emailAccessBootstrap";

const root = document.getElementById("root")!;

async function start() {
  if (/^\/email-access\/?$/.test(window.location.pathname)) {
    const credential = { token: captureEmailAccessToken() };
    const [{ EmailAccessPage }, { createEmailAccessExchange }] = await Promise.all([
      import("./pages/EmailAccessPage"),
      import("./lib/emailAccess"),
    ]);
    const exchange = createEmailAccessExchange(credential.token);
    credential.token = "";
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <EmailAccessPage exchange={exchange} />
      </React.StrictMode>,
    );
    return;
  }
  const { default: App } = await import("./App");
  if (root.dataset.prerenderedRoute) {
    // Resolve the prerendered route before hydration so existing article content
    // is never replaced by a lazy-route fallback.
    const [{ BlogPage }, { BlogPostPage }] = await Promise.all([
      import("./pages/BlogPage"),
      import("./pages/BlogPostPage"),
    ]);
    ReactDOM.hydrateRoot(
      root,
      <React.StrictMode>
        <App blogPages={{ index: BlogPage, post: BlogPostPage }} />
      </React.StrictMode>,
    );
  } else {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  }
}

void start();
