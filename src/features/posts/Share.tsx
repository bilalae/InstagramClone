import { useEffect, useState } from "react";
import type { PostCardData, Profile } from "../../types/social";
import { direct } from "../../services/social";
import { Modal, Status } from "../../components/Shared";
import { db, check, errorText } from "../../services/social";
export function Share({
  post,
  me,
  close,
}: {
  post: PostCardData;
  me: string;
  close: () => void;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setPeople([]);
        return;
      }
      void db
        .from("profiles")
        .select("*")
        .ilike("username", `${query.replace(/[^a-zA-Z0-9._]/g, "")}%`)
        .neq("id", me)
        .limit(15)
        .then((r) => {
          if (live) {
            if (r.error) setError(r.error.message);
            else setPeople(r.data);
          }
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, me]);
  return (
    <Modal title="Share" close={close}>
      <button
        onClick={() =>
          void navigator.clipboard
            .writeText(
              `${location.origin}/${post.reel ? "reel/" + post.reel.id : "p/" + post.id}`,
            )
            .then(() => setError("Link copied"))
            .catch((e) => setError(errorText(e)))
        }
      >
        Copy link
      </button>
      <label>
        Send to a person
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {people.map((p) => (
        <button
          disabled={busy}
          key={p.id}
          onClick={async () => {
            setBusy(true);
            try {
              const id = await direct(p.id);
              check(
                await db.from("messages").insert({
                  conversation_id: id,
                  sender_id: me,
                  message_type: post.reel ? "shared_reel" : "shared_post",
                  shared_post_id: post.id,
                }),
              );
              close();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Send to {p.username}
        </button>
      ))}
      <Status error={error} />
    </Modal>
  );
}
