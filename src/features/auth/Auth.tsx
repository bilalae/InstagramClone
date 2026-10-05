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
