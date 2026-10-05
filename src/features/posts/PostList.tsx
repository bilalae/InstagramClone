import { useEffect, useState, useRef, useCallback } from "react";
import type { PostCardData, Profile } from "../../types/social";
import { hydratePosts } from "../../services/social";
import { Link, MediaView, Status } from "../../components/Shared";
import { PostCard } from "./PostCard";
import { db, check, errorText } from "../../services/social";
import { RefreshCw } from "lucide-react";
export function PostList({
  me,
  mode = "feed",
  owner,
  postId,
  tag,
  collection,
}: {
  me: Profile;
  mode?: string;
  owner?: string;
  postId?: string;
  tag?: string;
  collection?: string;
}) {
  const [rows, setRows] = useState<PostCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [more, setMore] = useState(true);
  const page = useRef(0);
  const pending = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const load = useCallback(
    async (reset = false) => {
      if (pending.current) return;
      pending.current = true;
      setLoading(true);
      setError("");
      try {
        const start = reset ? 0 : page.current;
        let sourceLength: number | undefined;
        let query = db
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, start + 9);
        if (owner) query = query.eq("user_id", owner);
        if (postId) query = query.eq("id", postId);
        if (mode === "saved") {
          let q = db
            .from("saved_posts")
            .select("post_id")
            .eq("user_id", me.id)
            .order("created_at", { ascending: false })
            .range(start, start + 9);
          if (collection) q = q.eq("collection_id", collection);
          const ids = check(await q).map((s) => s.post_id);
          sourceLength = ids.length;
          query = db.from("posts").select("*").in("id", ids);
        }
        if (mode === "reels" && !owner) {
          let q = db
            .from("reels")
            .select("post_id")
            .order("created_at", { ascending: false })
            .range(start, start + 9);
          const reels = check(await q);
          sourceLength = reels.length;
          query = db
            .from("posts")
            .select("*")
            .in(
              "id",
              reels.map((r) => r.post_id),
            );
          if (owner) query = query.eq("user_id", owner);
        }
        if (tag) {
          const t = check(
            await db
              .from("hashtags")
              .select("id")
              .eq("name", tag)
              .maybeSingle(),
          );
          const ids = t
            ? check(
                await db
                  .from("post_hashtags")
                  .select("post_id")
                  .eq("hashtag_id", t.id)
                  .range(start, start + 9),
              ).map((p) => p.post_id)
            : [];
          query = db.from("posts").select("*").in("id", ids);
          sourceLength = ids.length;
        }
        const ranked =
          !owner && !postId && !tag && (mode === "feed" || mode === "explore");
        const posts =
          owner && ["reels", "tagged"].includes(mode)
            ? check(
                await db.rpc("profile_posts", {
                  target: owner,
                  kind: mode,
                  page_offset: start,
                }),
              )
            : ranked
              ? check(
                  await db.rpc("ranked_posts", {
                    page_offset: start,
                    explore: mode === "explore",
                  }),
                )
              : check(await query);
        const hydrated = await hydratePosts(posts, me.id);
        setRows((old) =>
          reset
            ? hydrated
            : [
                ...old,
                ...hydrated.filter((p) => !old.some((o) => o.id === p.id)),
              ],
        );
        page.current = start + 10;
        setMore((sourceLength ?? posts.length) === 10 && !postId);
      } catch (e) {
        setError(errorText(e));
      } finally {
        pending.current = false;
        setLoading(false);
      }
    },
    [me.id, owner, postId, mode, tag, collection],
  );
  useEffect(() => {
    page.current = 0;
    // Initial database load; the callback also sets the pending indicator.
    // eslint-disable-next-line react/set-state-in-effect
    void load(true);
  }, [load]);
  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver(
      (e) => {
        if (e[0].isIntersecting && more && !error) void load();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [load, more, error]);
  return (
    <div className={mode === "reels" ? "reels-list" : "post-list"}>
      <button
        className="feed-refresh icon-action"
        onClick={() => void load(true)}
        disabled={loading}
        aria-label="Refresh feed"
        title="Refresh feed"
      >
        <RefreshCw size={17} className={loading ? "is-spinning" : ""} />
      </button>
      {mode === "explore" || mode === "profile" || mode === "tagged" ? (
        <div className="real-grid">
          {rows.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`}>
              <div>
                {p.media[0] && (
                  <MediaView
                    path={p.media[0].thumbnail_url || p.media[0].media_url}
                    bucket="posts"
                    video={
                      !p.media[0].thumbnail_url &&
                      p.media[0].media_type === "video"
                    }
                    alt={p.media[0].alt_text || p.caption}
                    active={false}
                  />
                )}
                <span>
                  {p.reel ? "▶ " : ""}♥ {p.likes} · {p.comments} comments
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        rows.map((p) => (
          <PostCard
            key={`${p.id}-${p.updated_at}-${p.likes}-${p.saved}`}
            initial={p}
            me={me}
            onDelete={() => setRows((old) => old.filter((x) => x.id !== p.id))}
          />
        ))
      )}
      <Status
        loading={loading}
        error={error}
        empty={!loading && !rows.length}
        retry={() => void load()}
      />
      <div ref={sentinel} />
      {more && !loading && (
        <button onClick={() => void load()}>Load more</button>
      )}
    </div>
  );
}
