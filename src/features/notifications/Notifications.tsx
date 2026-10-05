import { useCallback, useEffect, useState } from "react";
import type { Notification, Profile } from "../../types/social";
import { db, check, errorText, profiles } from "../../services/social";
import { Avatar, Status, Time } from "../../components/Shared";
import { navigate } from "../../hooks/useRoute";
export function NotificationsPage({ me }: { me: Profile }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [actors, setActors] = useState<Profile[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [requests, setRequests] = useState<string[]>([]);
  const load = useCallback(
    async (offset = 0) => {
      try {
        const rows = check(
          await db
            .from("notifications")
            .select("*")
            .eq("user_id", me.id)
            .order("created_at", { ascending: false })
            .range(offset, offset + 29),
        );
        const p = await profiles(rows.map((r) => r.actor_id));
        const pending = check(
          await db
            .from("follows")
            .select("follower_id")
            .eq("following_id", me.id)
            .eq("status", "pending")
            .limit(100),
        );
        setRequests(pending.map((f) => f.follower_id));
        setItems((old) => (offset ? [...old, ...rows] : rows));
        setActors((old) => [...old, ...p]);
        setMore(rows.length === 30);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [me.id],
  );
  useEffect(() => {
    // Fetch persisted notifications before subscribing to changes.
    // eslint-disable-next-line react/set-state-in-effect
    void load();
    const channel = db
      .channel(`notification-list:${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${me.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [load, me.id]);
  return (
    <section className="page">
      <h1>Notifications</h1>
      <button
        onClick={() =>
          void db
            .from("notifications")
            .update({ read: true })
            .eq("user_id", me.id)
            .eq("read", false)
            .then((r) => {
              if (r.error) setError(r.error.message);
              else void load();
            })
        }
      >
        Mark all read
      </button>
      <Status
        loading={loading}
        error={error}
        empty={!loading && !items.length}
        retry={() => void load()}
      />
      {items.map((n) => {
        const actor = actors.find((p) => p.id === n.actor_id);
        return (
          <div className={`notice ${n.read ? "" : "unread"}`} key={n.id}>
            <Avatar
              path={actor?.avatar_url || null}
              name={actor?.username || "Member"}
            />
            <button
              onClick={async () => {
                try {
                  check(
                    await db
                      .from("notifications")
                      .update({ read: true })
                      .eq("id", n.id),
                  );
                  navigate(
                    n.entity_type === "post"
                      ? `/p/${n.entity_id}`
                      : n.entity_type === "story"
                        ? `/stories/${n.entity_id}`
                        : n.entity_type === "conversation"
                          ? `/direct/${n.entity_id}`
                          : `/${actor?.username || ""}`,
                  );
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              <strong>{actor?.username || "Member"}</strong>{" "}
              {n.type.replaceAll("_", " ")}
              <Time value={n.created_at} />
            </button>
            {n.type === "follow_request" && requests.includes(n.actor_id) && (
              <div className="toolbar">
                {["Accept", "Decline"].map((action) => (
                  <button
                    key={action}
                    onClick={async () => {
                      try {
                        check(
                          action === "Accept"
                            ? await db
                                .from("follows")
                                .update({ status: "accepted" })
                                .eq("following_id", me.id)
                                .eq("follower_id", n.actor_id)
                            : await db
                                .from("follows")
                                .delete()
                                .eq("following_id", me.id)
                                .eq("follower_id", n.actor_id),
                        );
                        check(
                          await db
                            .from("notifications")
                            .update({ read: true })
                            .eq("id", n.id),
                        );
                        await load();
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {more && (
        <button onClick={() => void load(items.length)}>Load more</button>
      )}
    </section>
  );
}
