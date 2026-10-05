import { useEffect, useState } from "react";
import type { Profile } from "../../types/social";
import { upload } from "../../services/social";
import { Status } from "../../components/Shared";
import { navigate } from "../../hooks/useRoute";
import { notify } from "../../utils/notify";
import { videoThumbnail } from "../../utils/videoThumbnail";
import { db, check, errorText } from "../../services/social";
export function CreatePost({ me }: { me: Profile }) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    // Object URLs are browser resources and must be created/revoked with this effect.
    // eslint-disable-next-line react/set-state-in-effect
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);
  return (
    <section className="page create-page">
      <h1>Create post</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!files.length) {
            setError("Select at least one image or video.");
            return;
          }
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          const paths: string[] = [];
          const thumbnails: (string | null)[] = [];
          try {
            if (
              f.get("reel") === "on" &&
              (files.length !== 1 || !files[0].type.startsWith("video/"))
            )
              throw new Error("A reel requires one video.");
            for (const file of files) {
              setProgress(`Uploading ${paths.length + 1} of ${files.length}`);
              paths.push(await upload(file, "posts", me.id));
              const thumbnail = await videoThumbnail(file);
              thumbnails.push(
                thumbnail ? await upload(thumbnail, "posts", me.id) : null,
              );
            }
            const postId = check(
              await db.rpc("publish_post", {
                caption_text: String(f.get("caption") || ""),
                location_text: String(f.get("location") || ""),
                allow_comments: f.get("comments") === "on",
                hide_likes: f.get("hidden") === "on",
                as_reel: f.get("reel") === "on",
                audio_text: String(f.get("audio") || ""),
                media_items: paths.map((path, i) => ({
                  media_url: path,
                  thumbnail_url: thumbnails[i],
                  media_type: files[i].type.startsWith("video/")
                    ? ("video" as const)
                    : ("image" as const),
                  alt_text: String(f.get(`alt-${i}`) || ""),
                })),
              }),
            );
            notify("Your post has been published.");
            navigate(`/p/${postId}`);
          } catch (err) {
            if (paths.length)
              await db.storage
                .from("posts")
                .remove([
                  ...paths,
                  ...thumbnails.filter((p): p is string => p !== null),
                ]);
            setError(errorText(err));
          } finally {
            setBusy(false);
            setProgress("");
          }
        }}
      >
        <label>
          Images or videos (up to 10)
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              if (selected.length > 10) setError("Select up to 10 files.");
              else setFiles(selected);
            }}
          />
        </label>
        <div className="upload-previews">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`}>
              {file.type.startsWith("video/") ? (
                <video src={previews[i]} controls />
              ) : (
                <img src={previews[i]} alt={`Preview ${i + 1}`} />
              )}
              <label>
                Alt text
                <input name={`alt-${i}`} maxLength={500} />
              </label>
              <button
                type="button"
                disabled={!i}
                onClick={() =>
                  setFiles((old) => {
                    const next = [...old];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    return next;
                  })
                }
              >
                Move earlier
              </button>
              <button
                type="button"
                onClick={() => setFiles((old) => old.filter((_, n) => n !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <label>
          Caption
          <textarea name="caption" maxLength={2200} />
        </label>
        <label>
          Location
          <input name="location" maxLength={150} />
        </label>
        <label>
          <input name="comments" type="checkbox" defaultChecked /> Allow
          comments
        </label>
        <label>
          <input name="hidden" type="checkbox" /> Hide like count
        </label>
        <label>
          <input name="reel" type="checkbox" /> Publish as reel (one video)
        </label>
        <label>
          Audio title
          <input name="audio" maxLength={150} />
        </label>
        <button disabled={busy}>{busy ? "Publishing…" : "Publish"}</button>
        <p role="status">{progress}</p>
        <Status error={error} />
      </form>
    </section>
  );
}
