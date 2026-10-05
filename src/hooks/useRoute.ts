import { useSyncExternalStore } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const subscribe = (fn: () => void) => {
  window.addEventListener("popstate", fn);
  return () => window.removeEventListener("popstate", fn);
};

export function appPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return `${basePath}${path}` || "/";
}

export function routePath(pathname = window.location.pathname) {
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    return pathname.slice(basePath.length) || "/";
  }
  return pathname;
}

export function appUrl(path: string) {
  return new URL(appPath(path), window.location.origin).toString();
}

export function navigate(path: string, replace = false) {
  if (!path.startsWith("/") || path.startsWith("//")) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", appPath(path));
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
export function useRoute() {
  return useSyncExternalStore(subscribe, () => routePath());
}
