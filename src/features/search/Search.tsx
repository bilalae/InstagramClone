import { useEffect, useState } from "react";
import type { Profile } from "../../types/social";
import { db, check, errorText } from "../../services/social";
import { Avatar, Link, Status } from "../../components/Shared";
import { FollowButton } from "../profile/Profile";
export function SearchPage({ me }: { me: Profile }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void db
      .from("recent_searches")
      .select("query")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setRecent(r.data.map((x) => x.query));
      });
  }, [me.id]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      const q = query
        .trim()
        .replace(/[^\p{L}\p{N}._ ]/gu, "")
        .slice(0, 100);
      if (!q) {
        setPeople([]);
        setTags([]);
        return;
      }
      setLoading(true);
      void Promise.all([
        db
          .from("profiles")
          .select("*")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(30),
        db.from("hashtags").select("name").ilike("name", `${q}%`).limit(20),
      ])
        .then(([p, t]) => {
          if (live) {
            setPeople(check(p));
            setTags(check(t).map((x) => x.name));
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);
  const remember = () => {
    if (query.trim())
      void db
        .from("recent_searches")
        .upsert({
          user_id: me.id,
          query: query.trim(),
          created_at: new Date().toISOString(),
        })
        .then((r) => {
          if (r.error) setError(r.error.message);
        });
  };
  return (
    <section className="page search-page">
      <h1>Search</h1>
      <label>
        People and hashtags
        <input
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      <Status
        loading={loading}
        error={error}
        empty={!!query && !loading && !people.length && !tags.length}
      />
      {!query && (
        <>
          <h2>Recent searches</h2>
          <button
            onClick={() =>
              void db
                .from("recent_searches")
                .delete()
                .eq("user_id", me.id)
                .then((r) => {
                  if (r.error) setError(r.error.message);
                  else setRecent([]);
                })
            }
          >
            Clear all
          </button>
          {recent.map((q) => (
            <div className="toolbar" key={q}>
              <button onClick={() => setQuery(q)}>{q}</button>
              <button
                aria-label={`Remove ${q}`}
                onClick={() =>
                  void db
                    .from("recent_searches")
                    .delete()
                    .eq("user_id", me.id)
                    .eq("query", q)
                    .then((r) => {
                      if (r.error) setError(r.error.message);
                      else setRecent((old) => old.filter((x) => x !== q));
                    })
                }
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
      {people.map((p) => (
        <div className="person" key={p.id}>
          <Avatar path={p.avatar_url} name={p.username} />
          <span onClick={remember}>
            <Link to={`/${p.username}`}>{p.username}</Link>
            <small>
              {p.display_name} · {p.bio}
            </small>
          </span>
          <FollowButton me={me.id} target={p} />
        </div>
      ))}
      {tags.map((t) => (
        <p key={t} onClick={remember}>
          <Link to={`/tags/${encodeURIComponent(t)}`}>#{t}</Link>
        </p>
      ))}
    </section>
  );
}
