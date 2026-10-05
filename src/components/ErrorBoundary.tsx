import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { appPath } from "../hooks/useRoute";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application error", error.message, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="real-auth">
        <h1>Something went wrong</h1>
        <p>Please reload the page to try again.</p>
        <button onClick={() => location.reload()}>Reload</button>
        <p>
          <a href={appPath("/")}>Go home</a>
        </p>
      </main>
    ) : (
      this.props.children
    );
  }
}
