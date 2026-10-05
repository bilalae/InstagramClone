import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Conversation,
  Member,
  Message,
  PostCardData,
  Profile,
} from "../../types/social";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  db,
  check,
  direct,
  errorText,
  hydratePosts,
  profiles,
  upload,
} from "../../services/social";
import {
  Avatar,
  Link,
  MediaView,
  Modal,
  Status,
  Time,
} from "../../components/Shared";
import { navigate } from "../../hooks/useRoute";
import { Report } from "../posts/Posts";
type InboxItem = Conversation & {
  members: Member[];
  people: Profile[];
  unread: number;
};
export function Messaging({
  me,
  conversationId,
}: {
  me: Profile;
  conversationId?: string;
}) {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async (offset = 0) => {
    try {
      const conv = check(
        await db
          .from("conversations")
          .select("*")
          .order("updated_at", { ascending: false })
          .range(offset, offset + 49),
      );
      const members = conv.length
        ? check(
            await db
              .from("conversation_members")
              .select("*")
              .in(
                "conversation_id",
                conv.map((c) => c.id),
              ),
          )
        : [];
      const people = await profiles(members.map((m) => m.user_id));
      const unread = check(
        await db.rpc("inbox_unread", {
          conversation_ids: conv.map((c) => c.id),
        }),
      );
      const items = conv.map((c) => ({
        ...c,
        members: members.filter((m) => m.conversation_id === c.id),
        people: people.filter((p) =>
          members.some((m) => m.conversation_id === c.id && m.user_id === p.id),
        ),
        unread: unread.find((u) => u.conversation_id === c.id)?.unread || 0,
      }));
      setInbox((old) =>
        offset
          ? [...old, ...items.filter((i) => !old.some((o) => o.id === i.id))]
          : items,
      );
      setMore(conv.length === 50);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Initial inbox request; subsequent updates come from Realtime.
    // eslint-disable-next-line react/set-state-in-effect
    void load();
    const channel = db
      .channel(`inbox:${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${me.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [me.id, load]);
  const active = inbox.find((c) => c.id === conversationId);
  return (
    <section className={`messaging ${conversationId ? "chat-open" : ""}`}>
      <aside>
        <h1>Messages</h1>
        <button onClick={() => setCreating(true)}>New conversation</button>
        <label>
          Search conversations
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Status
          loading={loading}
          error={error}
          retry={() => void load()}
          empty={!loading && !inbox.length}
        />
        {inbox
          .filter((c) =>
            `${c.title} ${c.people.map((p) => p.username).join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((c) => (
            <Link key={c.id} to={`/direct/${c.id}`}>
              <div
                className={`inbox-item ${c.id === conversationId ? "selected" : ""}`}
              >
                <Avatar
                  path={
                    c.people.find((p) => p.id !== me.id)?.avatar_url || null
                  }
                  name={
                    c.people.find((p) => p.id !== me.id)?.username ||
                      c.title ||
                      "Conversation"
                  }
                />
                <span className="inbox-copy">
                  <strong>
                    {c.title ||
                      c.people
                        .filter((p) => p.id !== me.id)
                        .map((p) => p.username)
                        .join(", ") ||
                      "Conversation"}
                  </strong>
                  <span>
                    {c.unread > 0 ? `${c.unread} unread` : "Active conversation"}
                  </span>
                  <Time value={c.updated_at} />
                </span>
              </div>
            </Link>
          ))}
        {more && (
          <button onClick={() => void load(inbox.length)}>
            Load more conversations
          </button>
        )}
      </aside>
      {conversationId ? (
        <Thread
          key={conversationId}
          id={conversationId}
          me={me}
          conversation={active}
          onRead={() => void load()}
        />
      ) : (
        <div className="chat-empty">
          Choose a conversation or start a new one.
        </div>
      )}
      {creating && (
        <NewConversation
          me={me.id}
          close={() => setCreating(false)}
          onCreate={(id) => {
            setCreating(false);
            void load();
            navigate(`/direct/${id}`);
          }}
        />
      )}
    </section>
  );
}
function NewConversation({
  me,
  close,
  onCreate,
}: {
  me: string;
  close: () => void;
  onCreate: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      if (!query) {
        setPeople([]);
        return;
      }
      void db
        .from("profiles")
        .select("*")
        .ilike("username", `${query.replace(/[^a-zA-Z0-9._]/g, "")}%`)
        .neq("id", me)
        .limit(20)
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
    <Modal title="New conversation" close={close}>
      <label>
        Find people
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {people.map((p) => (
        <label className="inline" key={p.id}>
          <input
            type="checkbox"
            checked={selected.some((s) => s.id === p.id)}
            onChange={(e) =>
              setSelected((old) =>
                e.target.checked
                  ? [...old, p]
                  : old.filter((s) => s.id !== p.id),
              )
            }
          />
          {p.username}
        </label>
      ))}
      <p>{selected.map((p) => p.username).join(", ")}</p>
      {selected.length > 1 && (
        <label>
          Group title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </label>
      )}
      <button
        disabled={
          busy || !selected.length || (selected.length > 1 && !title.trim())
        }
        onClick={async () => {
          setBusy(true);
          try {
            onCreate(
              selected.length === 1
                ? await direct(selected[0].id)
                : check(
                    await db.rpc("create_group", {
                      group_title: title,
                      member_ids: selected.map((p) => p.id),
                    }),
                  ),
            );
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Start conversation
      </button>
      <Status error={error} />
    </Modal>
  );
}
function SharedPostPreview({ id, me }: { id: string; me: string }) {
  const [post, setPost] = useState<PostCardData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(
      db.from("posts").select("*").eq("id", id).maybeSingle(),
    )
      .then(async (r) => {
        check(r);
        if (!r.data) {
          if (live) setUnavailable(true);
          return;
        }
        const [p] = await hydratePosts([r.data], me);
        if (live) setPost(p);
      })
      .catch(() => {
        if (live) setUnavailable(true);
      });
    return () => {
      live = false;
    };
  }, [id, me]);
  if (unavailable) return <p>Post unavailable or private.</p>;
  return post ? (
    <Link to={`/p/${id}`}>
      <div className="shared-preview">
        {post.media[0] && (
          <MediaView
            path={post.media[0].media_url}
            bucket="posts"
            video={post.media[0].media_type === "video"}
            active={false}
            alt={post.media[0].alt_text}
          />
        )}
        <strong>{post.author?.username}</strong>
        <p>{post.caption}</p>
      </div>
    </Link>
  ) : (
    <Status loading />
  );
}
function Thread({
  id,
  me,
  conversation,
  onRead,
}: {
  id: string;
  me: Profile;
  conversation?: InboxItem;
  onRead: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reply, setReply] = useState<Message | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [reactions, setReactions] = useState<
    { message_id: string; user_id: string; emoji: string }[]
  >([]);
  const channel = useRef<RealtimeChannel | null>(null);
  const typingTime = useRef(0);
  const typingExpiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(
    async (before?: string) => {
      try {
        let q = db
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(30);
        if (before) q = q.lt("created_at", before);
        const rows = check(await q).reverse();
        setMessages((old) => (before ? [...rows, ...old] : rows));
        setMore(rows.length === 30);
        const r = rows.length
          ? check(
              await db
                .from("message_reactions")
                .select("*")
                .in(
                  "message_id",
                  rows.map((m) => m.id),
                ),
            )
          : [];
        setReactions((old) => (before ? [...r, ...old] : r));
        setError("");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setLoading(false);
      }
    },
    [id],
  );
  useEffect(() => {
    let live = true;
    void load();
    const markRead = () => {
      if (document.visibilityState === "visible")
        void db
          .from("conversation_members")
          .update({ last_read_at: new Date().toISOString() })
          .eq("conversation_id", id)
          .eq("user_id", me.id)
          .then((r) => {
            if (r.error) {
              if (live) setError(r.error.message);
            } else if (live) onRead();
          });
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    const changes = db
      .channel(`messages:${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((old) =>
            old.some((m) => m.id === incoming.id) ? old : [...old, incoming],
          );
          markRead();
          end.current?.scrollIntoView({ block: "nearest" });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          setMessages((old) => old.filter((m) => m.id !== payload.old.id));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR")
          setError("Realtime connection failed. Refresh to reconnect.");
      });
    const presence = db
      .channel(`chat:${id}`, {
        config: { private: true, presence: { key: me.id } },
      })
      .on("presence", { event: "sync" }, () =>
        setOnline(Object.keys(presence.presenceState())),
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (typeof payload.user_id === "string" && payload.user_id !== me.id) {
          setTyping([payload.user_id]);
          if (typingExpiry.current) clearTimeout(typingExpiry.current);
          typingExpiry.current = setTimeout(() => setTyping([]), 3000);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED")
          void presence.track({
            user_id: me.id,
            online_at: new Date().toISOString(),
          });
      });
    channel.current = presence;
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", markRead);
      if (typingExpiry.current) clearTimeout(typingExpiry.current);
      void db.removeChannel(changes);
      void db.removeChannel(presence);
      channel.current = null;
    };
    // Membership changes update read receipts through the inbox subscription, without reopening the thread channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me.id, load]);
  const send = async () => {
    if ((!body.trim() && !file) || busy) return;
    setBusy(true);
    setError("");
    let path: string | undefined;
    try {
      if (file) path = await upload(file, "messages", me.id);
      const msg = check(
        await db
          .from("messages")
          .insert({
            conversation_id: id,
            sender_id: me.id,
            body: body.trim() || null,
            message_type: file
              ? file.type.startsWith("video/")
                ? "video"
                : "image"
              : "text",
            media_path: path || null,
            reply_to_message_id: reply?.id || null,
          })
          .select("*")
          .single(),
      );
      setMessages((old) =>
        old.some((m) => m.id === msg.id) ? old : [...old, msg],
      );
      setBody("");
      setFile(null);
      setReply(null);
      end.current?.scrollIntoView({ block: "nearest" });
    } catch (e) {
      if (path) await db.storage.from("messages").remove([path]);
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="thread">
      <header>
        <Link to="/direct">← Inbox</Link>
        <h2>
          {conversation?.title ||
            conversation?.people
              .filter((p) => p.id !== me.id)
              .map((p) => p.username)
              .join(", ") ||
            "Conversation"}
        </h2>
        <small>
          {online.filter((p) => p !== me.id).length ? "Online" : ""}
        </small>
        <button onClick={() => setMembersOpen(true)}>Members</button>
      </header>
      <Status loading={loading} error={error} retry={() => void load()} />
      <div className="history">
        {more && messages.length > 0 && (
          <button onClick={() => void load(messages[0].created_at)}>
            Earlier messages
          </button>
        )}
        {messages.map((m) => (
          <article
            key={m.id}
            className={`bubble ${m.sender_id === me.id ? "mine" : ""}`}
          >
            <strong>
              {conversation?.people.find((p) => p.id === m.sender_id)
                ?.username || "Member"}
            </strong>
            {m.reply_to_message_id && (
              <blockquote>
                {messages.find((p) => p.id === m.reply_to_message_id)?.body ||
                  "Reply to earlier message"}
              </blockquote>
            )}
            {m.body && <p>{m.body}</p>}
            {m.media_path && (
              <MediaView
                path={m.media_path}
                bucket="messages"
                video={m.message_type === "video"}
              />
            )}
            {m.shared_post_id && (
              <SharedPostPreview id={m.shared_post_id} me={me.id} />
            )}
            {m.message_type === "story_reply" && <small>Story reply</small>}
            <Time value={m.created_at} />
            {m.sender_id === me.id && (
              <small>
                {conversation?.members.some(
                  (p) =>
                    p.user_id !== me.id &&
                    p.last_read_at &&
                    p.last_read_at >= m.created_at,
                )
                  ? "Seen"
                  : "Sent"}
              </small>
            )}
            <div className="toolbar">
              <button onClick={() => setReply(m)}>Reply</button>
              <button
                onClick={async () => {
                  try {
                    const exists = reactions.some(
                      (r) =>
                        r.message_id === m.id &&
                        r.user_id === me.id &&
                        r.emoji === "❤️",
                    );
                    check(
                      exists
                        ? await db
                            .from("message_reactions")
                            .delete()
                            .eq("message_id", m.id)
                            .eq("user_id", me.id)
                            .eq("emoji", "❤️")
                        : await db.from("message_reactions").insert({
                            message_id: m.id,
                            user_id: me.id,
                            emoji: "❤️",
                          }),
                    );
                    setReactions((old) =>
                      exists
                        ? old.filter(
                            (r) =>
                              !(
                                r.message_id === m.id &&
                                r.user_id === me.id &&
                                r.emoji === "❤️"
                              ),
                          )
                        : [
                            ...old,
                            { message_id: m.id, user_id: me.id, emoji: "❤️" },
                          ],
                    );
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                ❤️ {reactions.filter((r) => r.message_id === m.id).length || ""}
              </button>
              {m.sender_id === me.id && (
                <button
                  onClick={async () => {
                    try {
                      check(await db.from("messages").delete().eq("id", m.id));
                      setMessages((old) => old.filter((x) => x.id !== m.id));
                      if (m.media_path)
                        check(
                          await db.storage
                            .from("messages")
                            .remove([m.media_path]),
                        );
                    } catch (e) {
                      setError(errorText(e));
                    }
                  }}
                >
                  Unsend
                </button>
              )}
              <Report me={me.id} type="message" id={m.id} />
            </div>
          </article>
        ))}
        <div ref={end} />
      </div>
      {typing.length > 0 && <small role="status">Someone is typing…</small>}
      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {reply && (
          <p>
            Replying: {reply.body}
            <button type="button" onClick={() => setReply(null)}>
              Cancel
            </button>
          </p>
        )}
        <label>
          Message
          <textarea
            value={body}
            maxLength={5000}
            onChange={(e) => {
              setBody(e.target.value);
              if (Date.now() - typingTime.current > 1000) {
                typingTime.current = Date.now();
                void channel.current?.send({
                  type: "broadcast",
                  event: "typing",
                  payload: { user_id: me.id },
                });
              }
            }}
          />
        </label>
        <label>
          Attach image or video
          <input
            key={file?.name || "empty"}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        {file && (
          <button type="button" onClick={() => setFile(null)}>
            Remove {file.name}
          </button>
        )}
        <button disabled={busy}>{busy ? "Sending…" : "Send"}</button>
      </form>
      {membersOpen && (
        <Modal title="Conversation members" close={() => setMembersOpen(false)}>
          {conversation?.people.map((p) => (
            <div className="person" key={p.id}>
              <Avatar path={p.avatar_url} name={p.username} />
              <Link to={`/${p.username}`}>{p.username}</Link>
              {conversation.type === "group" &&
                conversation.created_by === me.id &&
                p.id !== me.id && (
                  <button
                    onClick={() =>
                      void db
                        .rpc("manage_group", {
                          cid: id,
                          member: p.id,
                          remove_member: true,
                        })
                        .then((r) => {
                          if (r.error) setError(r.error.message);
                          else {
                            onRead();
                            setMembersOpen(false);
                          }
                        })
                    }
                  >
                    Remove
                  </button>
                )}
            </div>
          ))}
          {conversation?.type === "group" &&
            conversation.created_by === me.id && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    const username = String(f.get("username")).trim();
                    if (username) {
                      const p = check(
                        await db
                          .from("profiles")
                          .select("id")
                          .eq("username", username)
                          .single(),
                      );
                      check(
                        await db.rpc("manage_group", { cid: id, member: p.id }),
                      );
                    }
                    const title = String(f.get("title")).trim();
                    if (title)
                      check(
                        await db.rpc("manage_group", {
                          cid: id,
                          member: me.id,
                          new_title: title,
                        }),
                      );
                    onRead();
                    setMembersOpen(false);
                  } catch (err) {
                    setError(errorText(err));
                  }
                }}
              >
                <label>
                  Add member by username
                  <input name="username" />
                </label>
                <label>
                  Rename group
                  <input name="title" maxLength={100} />
                </label>
                <button>Update group</button>
              </form>
            )}
          <Status error={error} />
        </Modal>
      )}
    </div>
  );
}
