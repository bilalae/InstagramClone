import { useEffect, useState } from "react";
import type { Collection, Profile } from "../../types/social";
import { db, check, errorText, removeOwnedMedia } from "../../services/social";
import { Link, Modal, Status } from "../../components/Shared";
import { PostList } from "../posts/Posts";
import { navigate } from "../../hooks/useRoute";
export function Saved({ me }: { me: Profile }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    void db
      .from("saved_collections")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at")
      .limit(100)
      .then((r) => {
        if (r.error) setError(r.error.message);
        else setCollections(r.data);
      });
  }, [me.id, refresh]);
  return (
    <section className="page settings-page">
      <h1>Saved</h1>
      <p>Only you can see your saved posts.</p>
      <form
        className="toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          try {
            check(
              await db.from("saved_collections").insert({
                user_id: me.id,
                name: String(new FormData(form).get("name")).trim(),
              }),
            );
            form.reset();
            setRefresh((x) => x + 1);
          } catch (err) {
            setError(errorText(err));
          }
        }}
      >
        <label>
          New collection
          <input name="name" required maxLength={100} />
        </label>
        <button>Create collection</button>
      </form>
      <label>
        Collection
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">All saved</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <form
          className="toolbar"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              check(
                await db
                  .from("saved_collections")
                  .update({
                    name: String(
                      new FormData(e.currentTarget).get("rename"),
                    ).trim(),
                  })
                  .eq("id", selected),
              );
              setRefresh((x) => x + 1);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <label>
            Rename collection
            <input name="rename" required maxLength={100} />
          </label>
          <button>Rename</button>
          <button
            type="button"
            onClick={() =>
              void db
                .from("saved_collections")
                .delete()
                .eq("id", selected)
                .then((r) => {
                  if (r.error) setError(r.error.message);
                  else {
                    setSelected("");
                    setRefresh((x) => x + 1);
                  }
                })
            }
          >
            Delete collection
          </button>
        </form>
      )}
      <Status error={error} />
      <PostList
        key={selected}
        me={me}
        mode="saved"
        collection={selected || undefined}
      />
    </section>
  );
}
export function SettingsPage({
  me,
  onProfile,
}: {
  me: Profile;
  onProfile: (p: Profile) => void;
}) {
  const [appearance, setAppearance] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [notifications, setNotifications] = useState(true);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([
      db.from("user_settings").select("*").eq("user_id", me.id).maybeSingle(),
      db.from("blocks").select("blocked_id").eq("blocker_id", me.id).limit(100),
    ])
      .then(([s, b]) => {
        check(s);
        check(b);
        if (s.data) {
          setAppearance(s.data.appearance);
          setNotifications(s.data.notifications_enabled);
        }
        setBlocked((b.data || []).map((x) => x.blocked_id));
      })
      .catch((e) => setError(errorText(e)));
  }, [me.id]);
  const settings = async (a: typeof appearance, n: boolean) => {
    try {
      check(
        await db
          .from("user_settings")
          .upsert({ user_id: me.id, appearance: a, notifications_enabled: n }),
      );
      setAppearance(a);
      setNotifications(n);
      document.documentElement.dataset.theme = a;
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <section className="page">
      <h1>Settings</h1>
      <Link to="/settings/profile">Edit profile</Link>
      <h2>Privacy</h2>
      <label className="inline">
        <input
          type="checkbox"
          checked={me.is_private}
          onChange={async (e) => {
            try {
              const p = check(
                await db
                  .from("profiles")
                  .update({ is_private: e.target.checked })
                  .eq("id", me.id)
                  .select("*")
                  .single(),
              );
              onProfile(p);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        />{" "}
        Private account
      </label>
      <h3>Blocked accounts</h3>
      {blocked.map((id) => (
        <div className="toolbar" key={id}>
          <span>Blocked account {id.slice(0, 8)}</span>
          <button
            onClick={() =>
              void db
                .from("blocks")
                .delete()
                .eq("blocker_id", me.id)
                .eq("blocked_id", id)
                .then((r) => {
                  if (r.error) setError(r.error.message);
                  else setBlocked((old) => old.filter((x) => x !== id));
                })
            }
          >
            Unblock
          </button>
        </div>
      ))}
      {!blocked.length && <p>No blocked accounts.</p>}
      <h2>Notifications</h2>
      <label className="inline">
        <input
          type="checkbox"
          checked={notifications}
          onChange={(e) => void settings(appearance, e.target.checked)}
        />{" "}
        Enable activity notifications
      </label>
      <h2>Appearance</h2>
      <label>
        Theme
        <select
          value={appearance}
          onChange={(e) =>
            void settings(e.target.value as typeof appearance, notifications)
          }
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <h2>Security</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          try {
            check(
              await db.auth.updateUser({
                password: String(new FormData(form).get("password")),
              }),
            );
            form.reset();
            setError("Password updated");
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          New password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button disabled={busy}>Change password</button>
      </form>
      <div className="toolbar">
        <button
          onClick={() =>
            void db.auth.signOut().then((r) => {
              if (r.error) setError(r.error.message);
              else navigate("/login");
            })
          }
        >
          Log out
        </button>
        <button className="danger" onClick={() => setConfirm(true)}>
          Delete account
        </button>
      </div>
      <Status error={error} />
      {confirm && (
        <Modal
          title="Permanently delete account?"
          close={() => setConfirm(false)}
        >
          <p>
            Your profile, posts, follows, and messages will be removed
            permanently. Type DELETE to continue.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (new FormData(e.currentTarget).get("confirm") !== "DELETE")
                return;
              setBusy(true);
              try {
                await removeOwnedMedia(me.id);
                check(await db.rpc("delete_my_account", {}));
                await db.auth.signOut({ scope: "local" });
                navigate("/login");
              } catch (err) {
                setError(errorText(err));
                setConfirm(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Confirmation
              <input
                name="confirm"
                required
                pattern="DELETE"
                autoComplete="off"
              />
            </label>
            <button disabled={busy}>Delete permanently</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
