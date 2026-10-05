import { lazy, Suspense } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { ErrorBoundary } from "./components/ErrorBoundary";
const DemoApp = lazy(() => import("./DemoApp"));
const RealApp = lazy(() => import("./RealApp"));
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p role="status">Loading Instagram…</p>}>
        {isSupabaseConfigured ? <RealApp /> : <DemoApp />}
      </Suspense>
    </ErrorBoundary>
  );
}
