import { useState } from "react";
import { db, check, errorText } from "../../services/social";
import { appUrl, navigate } from "../../hooks/useRoute";
import { Link, Status } from "../../components/Shared";
export function AuthPage({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const signup = path === "/signup",
    forgot = path === "/forgot-password",
    reset = path === "/reset-password";
  return (
    <div className="auth-page">
      <div className="auth-stage">
        {!signup && !forgot && !reset && (
          <div className="auth-device" aria-hidden="true">
            <div className="auth-phone auth-phone-back"><span /></div>
            <div className="auth-phone auth-phone-front">
              <i className="auth-phone-camera" />
              <div className="auth-phone-bar">Instagram</div>
              <div className="auth-phone-story-row"><b /><b /><b /><b /></div>
              <div className="auth-phone-post" />
              <div className="auth-phone-actions"><span>♡</span><span>○</span><span>⌁</span></div>
              <div className="auth-phone-copy"><b /><span /><span /></div>
            </div>
          </div>
        )}
        <main className="real-auth">
      <section className="auth-panel">
        <h1 className="brand">Instagram</h1>
        {(signup || forgot || reset) && (
          <h2>
            {signup
              ? "Create account"
              : forgot
                ? "Reset your password"
                : "Choose a new password"}
          </h2>
        )}
        <form
          onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setMessage("");
          try {
            const email = String(f.get("email") || "");
            const password = String(f.get("password") || "");
            if (forgot) {
              check(
                await db.auth.resetPasswordForEmail(email, {
                  redirectTo: appUrl("/reset-password"),
                }),
              );
              setMessage("If this account exists, a reset link is on its way.");
            } else if (reset) {
              check(await db.auth.updateUser({ password }));
              const target = sessionStorage.getItem("ig-return-path") || "/";
              sessionStorage.removeItem("ig-return-path");
              navigate(
                target.startsWith("/") && !target.startsWith("//")
                  ? target
                  : "/",
              );
            } else if (signup) {
              if (
                !check(
                  await db.rpc("username_available", {
                    candidate: String(f.get("username")).toLowerCase(),
                  }),
                )
              )
                throw new Error("This username is unavailable.");
              const r = check(
                await db.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo: appUrl("/"),
                    data: {
                      username: String(f.get("username")).toLowerCase(),
                      display_name: String(f.get("name")),
                    },
                  },
                }),
              );
              if (r.session) navigate("/onboarding");
              else
                setMessage(
                  "Check your email to verify your account, then log in.",
                );
            } else {
              check(await db.auth.signInWithPassword({ email, password }));
              const target = sessionStorage.getItem("ig-return-path") || "/";
              sessionStorage.removeItem("ig-return-path");
              navigate(
                target.startsWith("/") && !target.startsWith("//")
                  ? target
                  : "/",
              );
            }
          } catch (err) {
            setMessage(errorText(err));
          } finally {
            setBusy(false);
          }
          }}
        >
        {signup && (
          <>
            <label>
              Username
              <input
                name="username"
                required
                pattern="[a-zA-Z0-9._]{1,30}"
                maxLength={30}
                autoComplete="username"
                placeholder="Username"
              />
            </label>
            <label>
              Display name
              <input name="name" maxLength={100} placeholder="Full name" />
            </label>
          </>
        )}
        {!reset && (
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={signup ? "Email" : "Phone number, username, or email"}
            />
          </label>
        )}
        {!forgot && (
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={8}
              required
              autoComplete={
                signup || reset ? "new-password" : "current-password"
              }
              placeholder="Password"
            />
          </label>
        )}
        <button disabled={busy}>
          {busy
            ? "Please wait…"
            : signup
              ? "Sign up"
              : forgot
                ? "Send reset link"
                : reset
                  ? "Update password"
                  : "Log in"}
        </button>
        </form>
        {!signup && !forgot && !reset && (
          <>
            <div className="auth-divider"><span>OR</span></div>
            <button className="facebook-login" type="button">Log in with Facebook</button>
          </>
        )}
        <p role="status">{message}</p>
        {!signup && !reset && (
          <Link to="/forgot-password">Forgot password?</Link>
        )}
      </section>
      {!reset && (
        <section className="auth-switch">
          <span>{signup ? "Have an account?" : "Don't have an account?"}</span>{" "}
          <Link to={signup ? "/login" : "/signup"}>
            {signup ? "Log in" : "Sign up"}
          </Link>
        </section>
      )}
        </main>
      </div>
      <footer className="auth-footer">
        <nav aria-label="Instagram links">
          <a href="https://about.meta.com/">Meta</a><a href="https://about.instagram.com/">About</a>
          <a href="https://about.instagram.com/blog/">Blog</a><a href="https://about.instagram.com/about-us/careers">Jobs</a>
          <a href="https://help.instagram.com/">Help</a><a href="https://developers.facebook.com/docs/instagram">API</a>
          <a href="https://privacycenter.instagram.com/policy/">Privacy</a><a href="https://help.instagram.com/581066165581870">Terms</a>
        </nav>
        <p>English · © 2026 Instagram clone</p>
      </footer>
    </div>
  );
}
export function AuthLoading({ error }: { error: string }) {
  return (
    <main className="real-auth">
      <Status loading={!error} error={error} retry={() => location.reload()} />
      <button onClick={() => void db.auth.signOut()}>Log out</button>
    </main>
  );
}
