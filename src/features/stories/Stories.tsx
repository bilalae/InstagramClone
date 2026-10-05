import { useEffect, useState } from "react";
import type { Profile, Story } from "../../types/social";
import {
  db,
  check,
  direct,
  errorText,
  profiles,
  upload,
} from "../../services/social";
import { Avatar, MediaView, Modal, Status } from "../../components/Shared";
export function Stories({
  me,
  initialId,
}: {
  me: Profile;
  initialId?: string;
}) {
  const [stories, setStories] = useState<Story[]>([]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [viewed, setViewed] = useState<string[]>([]);
  const [index, setIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [storyLimit, setStoryLimit] = useState(30);
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = check(
        await db
          .from("stories")
          .select("*")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(storyLimit),
      );
      const p = await profiles(s.map((x) => x.user_id));
      const v = s.length
        ? check(
            await db
              .from("story_views")
              .select("story_id")
              .eq("viewer_id", me.id)
              .in(
                "story_id",
                s.map((x) => x.id),
              ),
          )
        : [];
      if (live) {
        setStories(s);
        setPeople(p);
        setViewed(v.map((x) => x.story_id));
        if (initialId) {
          const i = s.findIndex((x) => x.id === initialId);
          if (i >= 0) setIndex(i);
          else setError("Story expired or unavailable.");
        }
      }
    })().catch((e) => {
      if (live) setError(errorText(e));
    });
    return () => {
      live = false;
    };
  }, [me.id, refresh, initialId, storyLimit]);
  useEffect(() => {
    const timer = setInterval(
      () =>
        setStories((old) =>
          old.filter((s) => new Date(s.expires_at).getTime() > Date.now()),
        ),
      30000,
    );
    return () => clearInterval(timer);
  }, []);
  const active = index === null ? null : stories[index];
  useEffect(() => {
    if (!active) return;
    void db
      .from("story_views")
      .upsert(
        { story_id: active.id, viewer_id: me.id },
        { ignoreDuplicates: true },
      )
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setViewed((old) => [...new Set([...old, active.id])]);
      });
  }, [active, me.id]);
  return (
    <section>
      <div className="real-stories">
        <label className="story-upload">
          <span className="story-add-avatar">
            <Avatar path={me.avatar_url} name={me.username} />
            <i aria-hidden="true">+</i>
          </span>
          <small>Your story</small>
          <input
            aria-label="Upload story"
            type="file"
            disabled={uploading}
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              let path: string | undefined;
              try {
                path = await upload(file, "stories", me.id);
                check(
                  await db.from("stories").insert({
                    user_id: me.id,
                    media_url: path,
                    media_type: file.type.startsWith("video/")
                      ? "video"
                      : "image",
                  }),
                );
                setRefresh((x) => x + 1);
              } catch (err) {
                if (path) await db.storage.from("stories").remove([path]);
                setError(errorText(err));
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {stories.map((s, i) => (
          <button
            className={viewed.includes(s.id) ? "viewed" : "unviewed"}
            key={s.id}
            onClick={() => setIndex(i)}
          >
            <Avatar
              path={people.find((p) => p.id === s.user_id)?.avatar_url || null}
              name={
                people.find((p) => p.id === s.user_id)?.username || "Member"
              }
            />
            <small>{people.find((p) => p.id === s.user_id)?.username}</small>
          </button>
        ))}
      </div>
      {stories.length === storyLimit && (
        <button onClick={() => setStoryLimit((n) => n + 30)}>
          More stories
        </button>
      )}
      {uploading && <p role="status">Uploading story…</p>}
      <Status error={error} />
      {active && index !== null && (
        <StoryViewer
          key={active.id}
          story={active}
          name={
            people.find((p) => p.id === active.user_id)?.username || "Member"
          }
          me={me.id}
          close={() => setIndex(null)}
          next={() => setIndex(index + 1 < stories.length ? index + 1 : null)}
          previous={() => setIndex(Math.max(0, index - 1))}
          deleted={() => {
            setIndex(null);
            setRefresh((x) => x + 1);
          }}
        />
      )}
    </section>
  );
}
function StoryViewer({
  story,
  name,
  me,
  close,
  next,
  previous,
  deleted,
}: {
  story: Story;
  name: string;
  me: string;
  close: () => void;
  next: () => void;
  previous: () => void;
  deleted: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [viewers, setViewers] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void db
      .from("story_likes")
      .select("user_id")
      .eq("story_id", story.id)
      .eq("user_id", me)
      .maybeSingle()
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setLiked(!!r.data);
      });
  }, [story.id, me]);
  useEffect(() => {
    if (paused || story.media_type === "video") return;
    const timer = setInterval(() => setProgress((p) => p + 1), 70);
    return () => clearInterval(timer);
  }, [paused, story.media_type]);
  useEffect(() => {
    if (progress >= 100 || new Date(story.expires_at).getTime() <= Date.now())
      next();
  }, [progress, next, story.expires_at]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        previous();
      }
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, previous]);
  return (
    <Modal title={name} close={close}>
      <div className="story-player">
        <progress value={progress} max={100} aria-label="Story progress" />
        <MediaView
          path={story.media_url}
          bucket="stories"
          video={story.media_type === "video"}
          active={!paused}
          onProgress={story.media_type === "video" ? setProgress : undefined}
          onEnded={story.media_type === "video" ? next : undefined}
          alt={`${name}'s story`}
        />
        <div className="toolbar">
          <button aria-label="Previous story" onClick={previous}>
            ← Previous
          </button>
          <button onClick={() => setPaused((p) => !p)}>
            {paused ? "Play" : "Pause"}
          </button>
          <button aria-label="Next story" onClick={next}>
            Next →
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                check(
                  liked
                    ? await db
                        .from("story_likes")
                        .delete()
                        .eq("story_id", story.id)
                        .eq("user_id", me)
                    : await db
                        .from("story_likes")
                        .insert({ story_id: story.id, user_id: me }),
                );
                setLiked(!liked);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {liked ? "♥ Unlike" : "♡ Like"}
          </button>
        </div>
        {me === story.user_id ? (
          <>
            <button
              onClick={async () => {
                try {
                  const v = check(
                    await db
                      .from("story_views")
                      .select("viewer_id")
                      .eq("story_id", story.id)
                      .limit(100),
                  );
                  setViewers(await profiles(v.map((x) => x.viewer_id)));
                  setPaused(true);
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Viewers
            </button>
            {viewers.map((p) => (
              <p key={p.id}>{p.username}</p>
            ))}
            <button
              onClick={async () => {
                try {
                  check(await db.from("stories").delete().eq("id", story.id));
                  if (story.media_url.startsWith(me + "/"))
                    check(
                      await db.storage
                        .from("stories")
                        .remove([story.media_url]),
                    );
                  deleted();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Delete story
            </button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const cid = await direct(story.user_id);
                check(
                  await db.from("messages").insert({
                    conversation_id: cid,
                    sender_id: me,
                    message_type: "story_reply",
                    story_id: story.id,
                    body: reply,
                  }),
                );
                setReply("");
                setError("Reply sent");
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Reply to story
              <input
                required
                maxLength={2200}
                value={reply}
                onFocus={() => setPaused(true)}
                onChange={(e) => setReply(e.target.value)}
              />
            </label>
            <button disabled={busy}>Send reply</button>
          </form>
        )}
        <Status error={error} />
      </div>
    </Modal>
  );
}
