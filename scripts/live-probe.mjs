import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((x) => x.includes("="))
    .map((x) => {
      const i = x.indexOf("=");
      return [x.slice(0, i), x.slice(i + 1).trim()];
    }),
);
const url = env.VITE_SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");
const client = () =>
  createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const results = [];
const credentials = [];
for (const label of ["a", "b"]) {
  const s = client();
  const username = `qa_${Date.now()}_${label}`;
  const email = `${username}@example.com`;
  const password = crypto.randomBytes(24).toString("base64url");
  const r = await s.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: `QA ${label.toUpperCase()}` } },
  });
  results.push({
    test: `signup ${label}`,
    status: r.error?.status || 200,
    error: r.error?.message || null,
    user: !!r.data.user,
    session: !!r.data.session,
  });
  if (r.data.user) {
    credentials.push({ email, password, id: r.data.user.id, username });
    if (r.data.session) {
      for (const table of ["profiles", "posts", "conversation_members"]) {
        const q = await s.from(table).select("*").limit(1);
        results.push({
          test: `${label} ${table}`,
          status: q.status,
          error: q.error,
        });
      }
    }
  }
}
fs.mkdirSync(".local", { recursive: true });
fs.writeFileSync(
  ".local/test-accounts.json",
  JSON.stringify(credentials, null, 2),
);
fs.writeFileSync(".local/live-results.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
