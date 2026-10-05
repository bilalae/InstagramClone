import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { mediaUrl, errorText } from "../services/social";
import { appPath, navigate } from "../hooks/useRoute";
export function Link({
  to,
  children,
  ariaLabel,
  current,
}: {
  to: string;
  children: ReactNode;
  ariaLabel?: string;
  current?: boolean;
}) {
  return (
    <a
      href={appPath(to)}
      aria-label={ariaLabel}
      aria-current={current ? "page" : undefined}
      onClick={(e) => {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(#[\p{L}\p{N}_]+|@[a-zA-Z0-9._]+)/gu).map((s, i) =>
        s.startsWith("#") ? (
          <Link key={i} to={`/tags/${encodeURIComponent(s.slice(1))}`}>
            {s}
          </Link>
        ) : s.startsWith("@") ? (
          <Link key={i} to={`/${s.slice(1)}`}>
            {s}
          </Link>
        ) : (
          s
        ),
      )}
    </>
  );
}
export function MediaView({
  path,
  bucket,
  video = false,
  alt = "",
  active = true,
  onViewed,
  onProgress,
  onEnded,
}: {
  path: string;
  bucket: string;
  video?: boolean;
  alt?: string;
  active?: boolean;
  onViewed?: () => void;
  onProgress?: (percent: number) => void;
  onEnded?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      mediaUrl(path, bucket)
        .then((u) => {
          if (live) {
            setUrl(u);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        });
    void load();
    const timer =
      bucket === "avatars" ? undefined : setInterval(() => void load(), 100000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [path, bucket]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && active) {
          void el.play().catch(() => {});
          onViewed?.();
        } else el.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [url, active, onViewed]);
  if (error) return <p role="status">Media unavailable: {error}</p>;
  if (!url) return <div className="skeleton" aria-label="Loading media" />;
  return video ? (
    <video
      ref={ref}
      src={url}
      controls
      muted
      loop={!onEnded}
      onEnded={onEnded}
      onTimeUpdate={(e) => {
        const video = e.currentTarget;
        if (video.duration && Number.isFinite(video.duration))
          onProgress?.((video.currentTime / video.duration) * 100);
      }}
      playsInline
      preload="metadata"
      onError={() => setError("The video could not be loaded.")}
      aria-label={alt || "Video"}
    />
  ) : (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setError("The image could not be loaded.")}
    />
  );
}
export function Avatar({ path, name }: { path: string | null; name: string }) {
  return path ? (
    <span className="avatar">
      <MediaView path={path} bucket="avatars" alt={name} />
    </span>
  ) : (
    <span className="avatar initials" aria-label={name}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="social-modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button onClick={close} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  if (loading)
    return (
      <div role="status" className="skeleton">
        Loading…
      </div>
    );
  if (error)
    return (
      <p role="alert">
        {error} {retry && <button onClick={retry}>Retry</button>}
      </p>
    );
  if (empty) return <p className="empty-state">Nothing here yet.</p>;
  return null;
}
export function Time({ value }: { value: string }) {
  return (
    <time dateTime={value} title={new Date(value).toLocaleString()}>
      {new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
