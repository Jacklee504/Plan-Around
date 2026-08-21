"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Dev-mode bundles aren't content-hashed the same way a production build
    // is, so the service worker's cache-first static-asset strategy would
    // otherwise serve a stale chunk after every hot-reload during development.
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installing the app still works without offline support if this fails.
    });
  }, []);

  return null;
}
