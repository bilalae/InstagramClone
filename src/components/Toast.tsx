import { useEffect, useState } from "react";
export function Toast() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const handler = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener("ig-toast", handler);
    return () => window.removeEventListener("ig-toast", handler);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timeout);
  }, [message]);
  return message ? (
    <div className="real-toast" role="status">
      {message}
      <button onClick={() => setMessage("")} aria-label="Dismiss notification">
        ×
      </button>
    </div>
  ) : null;
}
