import { useAuth } from "./hooks/useAuth";
import { useEffect, useState } from "react";
import {
  Compass,
  Film,
  Heart,
  House,
  MessageCircle,
  Menu,
  PlusSquare,
  Search,
  UserRound,
} from "lucide-react";
import { useRoute, navigate } from "./hooks/useRoute";
import { AuthLoading, AuthPage } from "./features/auth/Auth";
import { FollowButton, ProfileEditor, ProfilePage } from "./features/profile/Profile";
import { CreatePost, PostList } from "./features/posts/Posts";
import { SearchPage } from "./features/search/Search";
import { Stories } from "./features/stories/Stories";
import { Messaging } from "./features/messaging/Messaging";
import { NotificationsPage } from "./features/notifications/Notifications";
import { Saved, SettingsPage } from "./features/settings/Settings";
import { Avatar, Link, Status } from "./components/Shared";
import { db } from "./services/social";
import type { Profile } from "./types/social";
import "./real.css";
import { Toast } from "./components/Toast";
export default function RealApp() {
  const [schema, setSchema] = useState<"loading" | "ready" | "missing">(
    "loading",
  );
  useEffect(() => {
    let live = true;
    void db.rpc("app_schema_version", {}).then((r) => {
      if (live) setSchema(!r.error && r.data >= 5 ? "ready" : "missing");
    });
    return () => {
      live = false;
    };
  }, []);
  if (schema !== "ready")
    return (
      <main className="real-auth">
        <h1>Instagram</h1>
        {schema === "loading" ? (
          <Status loading />
        ) : (
          <>
            <h2>Database update required</h2>
            <p>
              This app needs a database update before you can sign in. Apply the
              pending migrations, then retry.
            </p>
            <button onClick={() => location.reload()}>Retry</button>
          </>
        )}
      </main>
    );
  return (
    <>
      <AuthenticatedApp />
      <Toast />
    </>
  );
}
function AuthenticatedApp() {
  const { session, profile, setProfile, loading, error } = useAuth();
  const path = useRoute();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (loading) return;
    if (
      !session &&
      !["/login", "/signup", "/forgot-password", "/reset-password"].includes(
        path,
      )
    ) {
      sessionStorage.setItem("ig-return-path", path);
      navigate("/login", true);
    }
    if (
      profile &&
      !profile.onboarding_completed &&
      !["/onboarding", "/reset-password"].includes(path)
    )
      navigate("/onboarding", true);
    if (
      profile?.onboarding_completed &&
      ["/login", "/signup", "/onboarding"].includes(path)
    )
      navigate("/", true);
  }, [loading, session, profile, path]);
  useEffect(() => {
    if (!profile) return;
    let live = true;
    const update = () =>
      void db
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("read", false)
        .then((r) => {
          if (live && !r.error) setUnread(r.count || 0);
        });
    update();
    void db
      .from("user_settings")
      .select("appearance")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then((r) => {
        if (live && r.data)
          document.documentElement.dataset.theme = r.data.appearance;
      });
    const c = db
      .channel(`badge:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        update,
      )
      .subscribe();
    return () => {
      live = false;
      void db.removeChannel(c);
    };
  }, [profile]);
  if (loading) return <AuthLoading error={error} />;
  if (path === "/reset-password") return <AuthPage path={path} />;
  if (!session) return <AuthPage path={path} />;
  if (!profile)
    return (
      <AuthLoading
        error={error || "Your profile could not be loaded. Please retry."}
      />
    );
  if (!profile.onboarding_completed)
    return (
      <div className="real-app">
        <ProfileEditor profile={profile} onSave={setProfile} onboarding />
      </div>
    );
  const nav = [
    ["/", "Home", House],
    ["/search", "Search", Search],
    ["/explore", "Explore", Compass],
    ["/reels", "Reels", Film],
    ["/direct", "Messages", MessageCircle],
    ["/notifications", "Notifications", Heart],
    ["/create", "Create", PlusSquare],
    [`/${profile.username}`, "Profile", UserRound],
  ] as const;
  let content: React.ReactNode;
  if (path === "/")
    content = (
      <HomeFeed me={profile} />
    );
  else if (path === "/search") content = <SearchPage me={profile} />;
  else if (path === "/explore")
    content = (
      <section className="page">
        <h1>Explore</h1>
        <PostList me={profile} mode="explore" />
      </section>
    );
  else if (path === "/reels")
    content = (
      <section className="feed-page">
        <h1>Reels</h1>
        <PostList me={profile} mode="reels" />
      </section>
    );
  else if (path.startsWith("/reel/"))
    content = <ReelRoute id={path.split("/")[2]} me={profile} />;
  else if (path.startsWith("/p/"))
    content = (
      <section className="feed-page">
        <PostList key={path} me={profile} postId={path.split("/")[2]} />
      </section>
    );
  else if (path.startsWith("/tags/"))
    content = (
      <section className="feed-page">
        <h1>#{decodeURIComponent(path.split("/")[2])}</h1>
        <PostList
          key={path}
          me={profile}
          tag={decodeURIComponent(path.split("/")[2]).toLowerCase()}
        />
      </section>
    );
  else if (path.startsWith("/stories/"))
    content = (
      <section className="feed-page">
        <Stories me={profile} initialId={path.split("/")[2]} />
      </section>
    );
  else if (path === "/direct" || path.startsWith("/direct/"))
    content = <Messaging me={profile} conversationId={path.split("/")[2]} />;
  else if (path === "/notifications")
    content = <NotificationsPage me={profile} />;
  else if (path === "/create") content = <CreatePost me={profile} />;
  else if (path === "/settings/profile")
    content = <ProfileEditor profile={profile} onSave={setProfile} />;
  else if (path === "/settings" || path.startsWith("/settings/"))
    content = <SettingsPage me={profile} onProfile={setProfile} />;
  else if (path === "/saved") content = <Saved me={profile} />;
  else if (/^\/[a-zA-Z0-9._]+(\/(followers|following))?$/.test(path))
    content = (
      <ProfilePage
        key={path}
        username={path.split("/")[1]}
        me={profile}
        tab={path.split("/")[2]}
      />
    );
  else
    content = (
      <section className="page">
        <h1>Page not found</h1>
        <Link to="/">Go home</Link>
      </section>
    );
  return (
    <div className="real-app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="real-sidebar">
        <Link to="/">
          <span className="brand">
            <span className="brand-icon" aria-hidden="true" />
            <span>Instagram</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {nav.map(([to, label, Icon]) => (
            <Link key={to} to={to} ariaLabel={label} current={path === to}>
              <span className={path === to ? "nav-active" : ""}>
                <Icon size={24} />
                <span>{label}</span>
                {to === "/notifications" && unread > 0 && (
                  <b className="nav-badge" aria-label={`${unread} unread notifications`}>
                    {unread > 9 ? "9+" : unread}
                  </b>
                )}
              </span>
            </Link>
          ))}
        </nav>
        <Link to="/settings" ariaLabel="More" current={path.startsWith("/settings")}>
          <span className={`sidebar-more ${path.startsWith("/settings") ? "nav-active" : ""}`}>
            <Menu size={24} />
            <span>More</span>
          </span>
        </Link>
      </aside>
      <main id="main" className="real-main" key={path}>
        <header className="real-mobile-header">
          <Link to="/" ariaLabel="Instagram home"><span className="brand">Instagram</span></Link>
          <div>
            <Link to="/notifications" ariaLabel="Notifications"><Heart size={24} /></Link>
            <Link to="/direct" ariaLabel="Messages"><MessageCircle size={24} /></Link>
          </div>
        </header>
        {content}
      </main>
    </div>
  );
}

function HomeFeed({ me }: { me: Profile }) {
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  useEffect(() => {
    let live = true;
    void db
      .from("profiles")
      .select("*")
      .neq("id", me.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then((result) => {
        if (live && !result.error) setSuggestions(result.data || []);
      });
    return () => { live = false; };
  }, [me.id]);
  return (
    <div className="home-layout">
      <section className="feed-page">
        <Stories me={me} />
        <PostList me={me} />
      </section>
      <aside className="feed-suggestions" aria-label="Suggested accounts">
        <div className="suggestion-self">
          <Avatar path={me.avatar_url} name={me.username} />
          <Link to={`/${me.username}`}>
            <strong>{me.username}</strong>
            <small>{me.display_name}</small>
          </Link>
          <Link to="/settings">Switch</Link>
        </div>
        <header><strong>Suggested for you</strong><Link to="/search">See all</Link></header>
        {suggestions.map((profile) => (
          <div className="suggestion-person" key={profile.id}>
            <Avatar path={profile.avatar_url} name={profile.username} />
            <Link to={`/${profile.username}`}>
              <strong>{profile.username}</strong>
              <small>Suggested for you</small>
            </Link>
            <FollowButton me={me.id} target={profile} />
          </div>
        ))}
        <footer>
          About · Help · Press · API · Jobs · Privacy · Terms<br />
          Locations · Language · Meta Verified<br /><br />
          © 2026 INSTAGRAM CLONE
        </footer>
      </aside>
    </div>
  );
}
function ReelRoute({
  id,
  me,
}: {
  id: string;
  me: import("./types/social").Profile;
}) {
  const [post, setPost] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void db
      .from("reels")
      .select("post_id")
      .eq("id", id)
      .single()
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setPost(r.data.post_id);
      });
  }, [id]);
  return (
    <section className="feed-page">
      {post ? (
        <PostList key={post} me={me} postId={post} />
      ) : (
        <Status loading={!error} error={error} />
      )}
    </section>
  );
}
