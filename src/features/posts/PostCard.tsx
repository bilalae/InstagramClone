import { useEffect, useState, useRef, useCallback } from "react";
import type { PostCardData, Profile, Collection } from "../../types/social";
import {
  Avatar,
  Link,
  MediaView,
  Modal,
  RichText,
  Status,
  Time,
} from "../../components/Shared";
import { FollowButton } from "../profile/Profile";
import { Comments } from "./Comments";
import { Share } from "./Share";
import { Report } from "./Report";
import { db, check, errorText } from "../../services/social";
import {
  Bookmark,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react";
export function PostCard({
  initial,
  me,
  onDelete,
}: {
  initial: PostCardData;
  me: Profile;
  onDelete?: () => void;
}) {
  const [post, setPost] = useState(initial);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState("");
  const [error, setError] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [likers, setLikers] = useState<Profile[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);
  useEffect(() => {
    if (!post.saved) return;
    let live = true;
    void Promise.all([
      db.from("saved_collections").select("*").eq("user_id", me.id).limit(100),
      db
        .from("saved_posts")
        .select("collection_id")
        .eq("user_id", me.id)
        .eq("post_id", post.id)
        .maybeSingle(),
    ])
      .then(([c, s]) => {
        check(c);
        check(s);
        if (live) {
          setCollections(c.data || []);
          setSelectedCollection(s.data?.collection_id || "");
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [post.saved, post.id, me.id]);
  const viewed = useRef(false);
  const reelId = post.reel?.id;
  const recordView = useCallback(() => {
    if (!reelId || viewed.current) return;
    viewed.current = true;
    void db
      .from("reel_views")
      .upsert({ reel_id: reelId, user_id: me.id }, { ignoreDuplicates: true })
      .then((r) => {
        if (r.error) {
          viewed.current = false;
          setError(r.error.message);
        }
      });
  }, [reelId, me.id]);
  const toggle = async (kind: "like" | "save", onlyLike = false) => {
    if (busy || (onlyLike && post.liked)) return;
    setBusy(true);
    const old = post;
    const active = kind === "like" ? post.liked : post.saved;
    setPost({
      ...post,
      ...(kind === "like"
        ? { liked: !active, likes: post.likes + (active ? -1 : 1) }
        : { saved: !active }),
    });
    try {
      const table = kind === "like" ? "post_likes" : "saved_posts";
      check(
        active
          ? await db
              .from(table)
              .delete()
              .eq("post_id", post.id)
              .eq("user_id", me.id)
          : await db.from(table).insert({ post_id: post.id, user_id: me.id }),
      );
      if (kind === "save" && !active)
        setCollections(
          check(
            await db
              .from("saved_collections")
              .select("*")
              .eq("user_id", me.id)
              .limit(100),
          ),
        );
    } catch (e) {
      setPost(old);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const refreshCount = () =>
    void db
      .from("comments")
      .select("*", { head: true, count: "exact" })
      .eq("post_id", post.id)
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setPost((p) => ({ ...p, comments: r.count || 0 }));
      });
  const showLikers = async () => {
    setModal("likers");
    setLikersLoading(true);
    try {
      const rows = check(
        await db
          .from("post_likes")
          .select("user_id")
          .eq("post_id", post.id)
          .order("created_at", { ascending: false })
          .limit(100),
      );
      const ids = [...new Set(rows.map((row) => row.user_id))];
      setLikers(
        ids.length
          ? check(await db.from("profiles").select("*").in("id", ids))
          : [],
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLikersLoading(false);
    }
  };
  return (
    <article className={`real-post ${post.reel ? "real-reel" : ""}`}>
      <header>
        <Avatar
          path={post.author?.avatar_url || null}
          name={post.author?.username || "Member"}
        />
        <div>
          <Link to={`/${post.author?.username || ""}`}>
            {post.author?.username || "Member"}
          </Link>
          <small>{post.location}</small>
        </div>
        {post.author && <FollowButton me={me.id} target={post.author} />}
      </header>
      <div
        className="post-media"
        onDoubleClick={() => void toggle("like", true)}
      >
        {post.media[index] && (
          <MediaView
            path={post.media[index].media_url}
            bucket="posts"
            video={post.media[index].media_type === "video"}
            onViewed={recordView}
            alt={post.media[index].alt_text || post.caption}
          />
        )}
      </div>
      {post.media.length > 1 && (
        <div className="toolbar">
          <button
            aria-label="Previous media"
            disabled={!index}
            onClick={() => setIndex((i) => i - 1)}
          >
            ←
          </button>
          <span>
            {index + 1} / {post.media.length}
          </span>
          <button
            aria-label="Next media"
            disabled={index === post.media.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            →
          </button>
        </div>
      )}
      <div className="post-body">
        <div className="post-actions">
          <div>
            <button
              className={post.liked ? "icon-action liked" : "icon-action"}
              disabled={busy}
              aria-pressed={post.liked}
              aria-label={post.liked ? "♥ Unlike" : "♡ Like"}
              title={post.liked ? "Unlike" : "Like"}
              onClick={() => void toggle("like")}
            >
              <Heart size={24} fill={post.liked ? "currentColor" : "none"} />
            </button>
            <button
              className="icon-action"
              aria-label={`Comments (${post.comments})`}
              title="Comment"
              onClick={() => setModal("comments")}
            >
              <MessageCircle size={24} />
            </button>
            <button
              className="icon-action"
              aria-label="Share"
              title="Share"
              onClick={() => setModal("share")}
            >
              <Send size={24} />
            </button>
          </div>
          <button
            className={post.saved ? "icon-action saved" : "icon-action"}
            disabled={busy}
            aria-pressed={post.saved}
            aria-label={post.saved ? "Unsave" : "Save"}
            title={post.saved ? "Unsave" : "Save"}
            onClick={() => void toggle("save")}
          >
            <Bookmark size={24} fill={post.saved ? "currentColor" : "none"} />
          </button>
        </div>
        {!post.likes_hidden && (
          <button className="like-count" onClick={() => void showLikers()}>
            {post.likes} likes
          </button>
        )}
        <p>
          <RichText text={post.caption} />
        </p>
        {post.reel && (
          <small>
            ♫ {post.reel.audio_title || "Original audio"} · {post.reel.views}{" "}
            views
          </small>
        )}
        <Link to={`/p/${post.id}`}>
          <Time value={post.created_at} />
        </Link>
        {post.saved && collections.length > 0 && (
          <label>
            Collection
            <select
              value={selectedCollection}
              onChange={(e) =>
                void db
                  .from("saved_posts")
                  .update({ collection_id: e.target.value || null })
                  .eq("user_id", me.id)
                  .eq("post_id", post.id)
                  .then((r) => {
                    if (r.error) setError(r.error.message);
                    else setSelectedCollection(e.target.value);
                  })
              }
            >
              <option value="">All saved</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="toolbar">
          {post.user_id === me.id && (
            <>
              <button onClick={() => setModal("edit")}>Edit</button>
              <button onClick={() => setModal("delete")}>Delete</button>
            </>
          )}
          <Report
            me={me.id}
            type={post.reel ? "reel" : "post"}
            id={post.reel?.id || post.id}
          />
        </div>
        <Status error={error} />
      </div>
      {modal === "comments" && (
        <Comments
          post={post}
          me={me}
          close={() => setModal("")}
          onCount={refreshCount}
        />
      )}
      {modal === "likers" && (
        <Modal title="Liked by" close={() => setModal("")}>
          {likersLoading ? (
            <Status loading />
          ) : likers.length ? (
            <div className="likers-list">
              {likers.map((liker) => (
                <div className="liker-row" key={liker.id}>
                  <Avatar path={liker.avatar_url} name={liker.username} />
                  <Link to={`/${liker.username}`}>
                    <strong>{liker.username}</strong>
                    <small>{liker.display_name}</small>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No likes yet.</p>
          )}
        </Modal>
      )}
      {modal === "share" && (
        <Share post={post} me={me.id} close={() => setModal("")} />
      )}
      {modal === "delete" && (
        <Modal title="Delete post?" close={() => setModal("")}>
          <p>This permanently deletes the post and its interactions.</p>
          <button
            onClick={async () => {
              try {
                check(await db.from("posts").delete().eq("id", post.id));
                const paths = post.media
                  .flatMap((m) => [
                    m.media_url,
                    ...(m.thumbnail_url ? [m.thumbnail_url] : []),
                  ])
                  .filter((p) => p.startsWith(me.id + "/"));
                if (paths.length)
                  check(await db.storage.from("posts").remove(paths));
                setModal("");
                onDelete?.();
              } catch (e) {
                setError(errorText(e));
                setModal("");
              }
            }}
          >
            Delete permanently
          </button>
        </Modal>
      )}
      {modal === "edit" && (
        <Modal title="Edit post" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const changes = {
                  caption: String(f.get("caption")),
                  location: String(f.get("location")),
                  comments_enabled: f.get("comments") === "on",
                  likes_hidden: f.get("hidden") === "on",
                };
                check(await db.from("posts").update(changes).eq("id", post.id));
                setPost({ ...post, ...changes });
                setModal("");
              } catch (err) {
                setError(errorText(err));
              }
            }}
          >
            <label>
              Caption
              <textarea
                name="caption"
                defaultValue={post.caption}
                maxLength={2200}
              />
            </label>
            <label>
              Location
              <input name="location" defaultValue={post.location || ""} />
            </label>
            <label>
              <input
                name="comments"
                type="checkbox"
                defaultChecked={post.comments_enabled}
              />{" "}
              Enable comments
            </label>
            <label>
              <input
                name="hidden"
                type="checkbox"
                defaultChecked={post.likes_hidden}
              />{" "}
              Hide likes
            </label>
            <button>Save</button>
            <Status error={error} />
          </form>
        </Modal>
      )}
    </article>
  );
}
