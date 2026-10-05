import { useEffect, useState } from "react";
import type { Profile } from "../../types/social";
import {
  db,
  check,
  errorText,
  upload,
  follow,
  direct,
} from "../../services/social";
import { Avatar, Link, Status } from "../../components/Shared";
import { navigate } from "../../hooks/useRoute";
import { PostList } from "../posts/Posts";
import { Report } from "../posts/Posts";
import { notify } from "../../utils/notify";
import { Clapperboard, Grid3X3, UserSquare2 } from "lucide-react";
export function FollowButton({
  me,
  target,
  changed,
}: {
  me: string;
  target: Profile;
  changed?: () => void;
}) {
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      const changed = (
        event as CustomEvent<{ target: string; status?: string }>
      ).detail;
      if (changed.target === target.id) setStatus(changed.status);
    };
    window.addEventListener("ig-follow-change", handler);
    return () => window.removeEventListener("ig-follow-change", handler);
  }, [target.id]);
  useEffect(() => {
    if (me === target.id) return;
    let live = true;
    db.from("follows")
      .select("status")
      .eq("follower_id", me)
      .eq("following_id", target.id)
      .maybeSingle()
      .then((r) => {
        if (live) {
          if (r.error) setError(r.error.message);
          else setStatus(r.data?.status);
        }
      });
    return () => {
      live = false;
    };
  }, [me, target.id]);
  if (me === target.id) return null;
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const old = status;
          setStatus(
            status ? undefined : target.is_private ? "pending" : "accepted",
          );
          try {
            await follow(me, target, old);
            changed?.();
          } catch (e) {
            setStatus(old);
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {status === "pending" ? "Requested" : status ? "Following" : "Follow"}
      </button>
      {error && <small role="alert">{error}</small>}
    </>
  );
}
export function ProfileEditor({
  profile,
  onSave,
  onboarding = false,
}: {
  profile: Profile;
  onSave: (p: Profile) => void;
  onboarding?: boolean;
}) {
  const [username, setUsername] = useState(profile.username);
  const [available, setAvailable] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void db
        .rpc("username_available", { candidate: username.toLowerCase() })
        .then((r) => {
          if (live)
            setAvailable(
              r.error
                ? r.error.message
                : r.data
                  ? "Username available"
                  : "Username unavailable",
            );
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [username, profile.id]);
  useEffect(() => {
    if (onboarding)
      void db
        .from("profiles")
        .select("*")
        .neq("id", profile.id)
        .limit(8)
        .then((r) => {
          if (r.error) setError(r.error.message);
          else setSuggestions(r.data);
        });
  }, [onboarding, profile.id]);
  return (
    <section className="page">
      <h1>{onboarding ? "Make yourself at home" : "Edit profile"}</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            let avatar = profile.avatar_url;
            const file = f.get("avatar");
            if (file instanceof File && file.size)
              avatar = await upload(file, "avatars", profile.id);
            const website = String(f.get("website") || "");
            if (website && !/^https?:\/\//i.test(website))
              throw new Error("Website must start with https:// or http://");
            const updated = check(
              await db
                .from("profiles")
                .update({
                  username: username.toLowerCase(),
                  display_name: String(f.get("name")),
                  bio: String(f.get("bio")),
                  website,
                  avatar_url: avatar,
                  is_private: f.get("private") === "on",
                  onboarding_completed: true,
                })
                .eq("id", profile.id)
                .select("*")
                .single(),
            );
            onSave(updated);
            notify("Your profile has been saved.");
            navigate(onboarding ? "/" : `/${updated.username}`);
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Avatar path={profile.avatar_url} name={profile.username} />
        <label>
          Avatar
          <input
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
          />
        </label>
        <label>
          Username
          <input
            required
            pattern="[a-zA-Z0-9._]{1,30}"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
          />
          <small role="status">{available}</small>
        </label>
        <label>
          Display name
          <input
            name="name"
            defaultValue={profile.display_name}
            maxLength={100}
          />
        </label>
        <label>
          Bio
          <textarea name="bio" defaultValue={profile.bio} maxLength={500} />
        </label>
        <label>
          Website
          <input
            name="website"
            type="url"
            defaultValue={profile.website || ""}
          />
        </label>
        <label className="inline">
          <input
            type="checkbox"
            name="private"
            defaultChecked={profile.is_private}
          />{" "}
          Private account
        </label>
        <button disabled={busy}>
          {busy
            ? "Saving…"
            : onboarding
              ? "Complete onboarding"
              : "Save changes"}
        </button>
        <Status error={error} />
      </form>
      {onboarding && (
        <>
          <h2>People to follow</h2>
          {suggestions.map((p) => (
            <div className="person" key={p.id}>
              <Avatar path={p.avatar_url} name={p.username} />
              <span>{p.username}</span>
              <FollowButton me={profile.id} target={p} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
export function ProfilePage({
  username,
  me,
  tab,
}: {
  username: string;
  me: Profile;
  tab?: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [counts, setCounts] = useState([0, 0, 0]);
  const [people, setPeople] = useState<Profile[]>([]);
  const [peopleMore, setPeopleMore] = useState(false);
  const [peopleOffset, setPeopleOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("posts");
  useEffect(() => {
    let live = true;
    void (async () => {
      const p = check(
        await db.from("profiles").select("*").eq("username", username).single(),
      );
      const results = await Promise.all([
        db
          .from("posts")
          .select("*", { head: true, count: "exact" })
          .eq("user_id", p.id),
        db
          .from("follows")
          .select("*", { head: true, count: "exact" })
          .eq("following_id", p.id)
          .eq("status", "accepted"),
        db
          .from("follows")
          .select("*", { head: true, count: "exact" })
          .eq("follower_id", p.id)
          .eq("status", "accepted"),
      ]);
      results.forEach(check);
      if (live) {
        setError("");
        setProfile(p);
        setCounts(results.map((r) => r.count || 0));
      }
      if (tab) {
        const rows = check(
          await db
            .from("follows")
            .select("*")
            .eq(tab === "followers" ? "following_id" : "follower_id", p.id)
            .eq("status", "accepted")
            .order("created_at", { ascending: false })
            .range(0, 29),
        );
        const ids = rows.map((r) =>
          tab === "followers" ? r.follower_id : r.following_id,
        );
        const found = ids.length
          ? check(await db.from("profiles").select("*").in("id", ids))
          : [];
        if (live) {
          setPeople(found);
          setPeopleMore(rows.length === 30);
          setPeopleOffset(30);
        }
      }
    })().catch((e) => {
      if (live) setError(errorText(e));
    });
    return () => {
      live = false;
    };
  }, [username, tab, refresh]);
  if (!profile) return <Status loading={!error} error={error} />;
  return (
    <section className="page">
      <header className="profile-top">
        <Avatar path={profile.avatar_url} name={profile.username} />
        <div className="profile-info">
          <div className="profile-heading">
            <h1>
              {profile.username} {profile.is_verified && "✓"} {" "}
              {profile.is_private && "🔒"}
            </h1>
            <div className="profile-actions">
              {profile.id === me.id ? (
                <Link to="/settings/profile">Edit profile</Link>
              ) : (
                <>
                  <FollowButton
                    me={me.id}
                    target={profile}
                    changed={() => setRefresh((x) => x + 1)}
                  />
                  <button
                    onClick={() =>
                      void direct(profile.id)
                        .then((id) => navigate(`/direct/${id}`))
                        .catch((e) => setError(errorText(e)))
                    }
                  >
                    Message
                  </button>
                  <button
                    onClick={() =>
                      void db
                        .from("blocks")
                        .insert({ blocker_id: me.id, blocked_id: profile.id })
                        .then((r) => {
                          if (r.error) setError(r.error.message);
                          else navigate("/");
                        })
                    }
                  >
                    Block
                  </button>
                </>
              )}
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(`${location.origin}/${profile.username}`)
                    .catch((e) => setError(errorText(e)))
                }
              >
                Copy profile link
              </button>
              {profile.id !== me.id && (
                <Report me={me.id} type="user" id={profile.id} />
              )}
            </div>
          </div>
          <div className="profile-stats">
            <span><strong>{counts[0]}</strong><small>posts</small></span>
            <Link to={`/${username}/followers`}><strong>{counts[1]}</strong><small>followers</small></Link>
            <Link to={`/${username}/following`}><strong>{counts[2]}</strong><small>following</small></Link>
          </div>
          <div className="profile-bio">
            <strong>{profile.display_name}</strong>
            {profile.bio && <p>{profile.bio}</p>}
            {profile.website && /^https?:\/\//.test(profile.website) && (
              <a href={profile.website} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            )}
          </div>
        </div>
      </header>
      <Status error={error} />
      {tab ? (
        <>
          <h2>{tab}</h2>
          {people.map((p) => (
            <div className="person" key={p.id}>
              <Link to={`/${p.username}`}>{p.username}</Link>
              <FollowButton me={me.id} target={p} />
              {me.id === profile.id && tab === "followers" && (
                <button
                  onClick={() =>
                    void db
                      .from("follows")
                      .delete()
                      .eq("follower_id", p.id)
                      .eq("following_id", me.id)
                      .then((r) => {
                        if (r.error) setError(r.error.message);
                        else setRefresh((x) => x + 1);
                      })
                  }
                >
                  Remove follower
                </button>
              )}
            </div>
          ))}
          <Status empty={!people.length} />
          {peopleMore && (
            <button
              onClick={async () => {
                try {
                  const rows = check(
                    await db
                      .from("follows")
                      .select("*")
                      .eq(
                        tab === "followers" ? "following_id" : "follower_id",
                        profile.id,
                      )
                      .eq("status", "accepted")
                      .order("created_at", { ascending: false })
                      .range(peopleOffset, peopleOffset + 29),
                  );
                  const ids = rows.map((r) =>
                    tab === "followers" ? r.follower_id : r.following_id,
                  );
                  const found = ids.length
                    ? check(await db.from("profiles").select("*").in("id", ids))
                    : [];
                  setPeople((old) => [...old, ...found]);
                  setPeopleOffset((old) => old + 30);
                  setPeopleMore(rows.length === 30);
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Load more
            </button>
          )}
        </>
      ) : (
        <>
          <div className="profile-tabs">
            {[
              ["posts", Grid3X3, "Posts"],
              ["reels", Clapperboard, "Reels"],
              ["tagged", UserSquare2, "Tagged"],
            ].map(([t, Icon, label]) => (
              <button
                key={t as string}
                className={selected === t ? "active" : ""}
                aria-pressed={selected === t}
                aria-label={label as string}
                title={label as string}
                onClick={() => setSelected(t as string)}
              >
                <Icon size={20} />
              </button>
            ))}
            {me.id === profile.id && <Link to="/saved">Saved</Link>}
          </div>
          <PostList
            key={`${profile.id}-${selected}-${refresh}`}
            me={me}
            owner={profile.id}
            mode={selected === "posts" ? "profile" : selected}
          />
        </>
      )}
    </section>
  );
}
