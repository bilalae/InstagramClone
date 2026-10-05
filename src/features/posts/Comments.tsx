import { useEffect, useState, useCallback } from "react";
import type { PostCardData, Profile, Comment } from "../../types/social";
import { profiles } from "../../services/social";
import { Link, Modal, RichText, Status, Time } from "../../components/Shared";
import { Report } from "./Report";
import { db, check, errorText } from "../../services/social";
export function Comments({
  post,
  me,
  close,
  onCount,
}: {
  post: PostCardData;
  me: Profile;
  close: () => void;
  onCount: () => void;
}) {
  const [rows, setRows] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Profile[]>([]);
  const [likes, setLikes] = useState<string[]>([]);
  const [reply, setReply] = useState<Comment | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(true);
  const load = useCallback(
    async (offset = 0) => {
      try {
        const data = check(
          await db
            .from("comments")
            .select("*")
            .eq("post_id", post.id)
            .order("created_at")
            .order("id")
            .range(offset, offset + 29),
        );
        const users = await profiles(data.map((c) => c.user_id));
        const liked = data.length
          ? check(
              await db
                .from("comment_likes")
                .select("comment_id")
                .eq("user_id", me.id)
                .in(
                  "comment_id",
                  data.map((c) => c.id),
                ),
            )
          : [];
        setRows((prev) => (offset ? [...prev, ...data] : data));
        setAuthors((prev) => [...prev, ...users]);
        setLikes((prev) => [
          ...new Set([...prev, ...liked.map((l) => l.comment_id)]),
        ]);
        setMore(data.length === 30);
      } catch (e) {
        setError(errorText(e));
      }
    },
    [post.id, me.id],
  );
  useEffect(() => {
    // Synchronize the drawer with the database on mount.
    // eslint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);
  const render = (c: Comment, depth = 0): React.ReactNode => (
    <div
      key={c.id}
      className="comment"
      style={{ marginLeft: Math.min(depth, 4) * 12 }}
    >
      <strong>
        <Link
          to={`/${authors.find((p) => p.id === c.user_id)?.username || ""}`}
        >
          {authors.find((p) => p.id === c.user_id)?.username || "Member"}
        </Link>
      </strong>{" "}
      <RichText text={c.body} />
      <Time value={c.created_at} />
      <div className="toolbar">
        <button onClick={() => setReply(c)}>Reply</button>
        <button
          onClick={async () => {
            const old = likes;
            const has = likes.includes(c.id);
            setLikes(has ? likes.filter((i) => i !== c.id) : [...likes, c.id]);
            try {
              check(
                has
                  ? await db
                      .from("comment_likes")
                      .delete()
                      .eq("comment_id", c.id)
                      .eq("user_id", me.id)
                  : await db
                      .from("comment_likes")
                      .insert({ comment_id: c.id, user_id: me.id }),
              );
            } catch (e) {
              setLikes(old);
              setError(errorText(e));
            }
          }}
        >
          {likes.includes(c.id) ? "Unlike" : "Like"}
        </button>
        {c.user_id === me.id && (
          <button
            onClick={async () => {
              try {
                check(await db.from("comments").delete().eq("id", c.id));
                await load();
                onCount();
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Delete
          </button>
        )}
        <Report me={me.id} type="comment" id={c.id} />
      </div>
      {rows
        .filter((child) => child.parent_comment_id === c.id)
        .map((child) => render(child, depth + 1))}
    </div>
  );
  return (
    <Modal title="Comments" close={close}>
      <Status error={error} empty={!rows.length} />
      {rows
        .filter(
          (c) =>
            !c.parent_comment_id ||
            !rows.some((p) => p.id === c.parent_comment_id),
        )
        .map((c) => render(c))}
      {more && (
        <button onClick={() => void load(rows.length)}>Load more</button>
      )}
      {post.comments_enabled ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("body")).trim();
            if (!body) return;
            setBusy(true);
            const temporary: Comment = {
              id: crypto.randomUUID(),
              post_id: post.id,
              user_id: me.id,
              parent_comment_id: reply?.id || null,
              body,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            setRows((prev) => [...prev, temporary]);
            setAuthors((prev) => [...prev, me]);
            try {
              const result = check(
                await db
                  .from("comments")
                  .insert({
                    post_id: post.id,
                    user_id: me.id,
                    parent_comment_id: reply?.id || null,
                    body,
                  })
                  .select("*")
                  .single(),
              );
              setRows((prev) =>
                prev.map((c) => (c.id === temporary.id ? result : c)),
              );
              form.reset();
              setReply(null);
              onCount();
            } catch (err) {
              setRows((prev) => prev.filter((c) => c.id !== temporary.id));
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {reply && (
            <p>
              Replying to comment{" "}
              <button type="button" onClick={() => setReply(null)}>
                Cancel
              </button>
            </p>
          )}
          <label>
            Add a comment
            <textarea name="body" required maxLength={2200} />
          </label>
          <button disabled={busy}>Post comment</button>
        </form>
      ) : (
        <p>Comments are disabled.</p>
      )}
    </Modal>
  );
}
