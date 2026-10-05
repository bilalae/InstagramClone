import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "../types/social";
import { db } from "../services/social";
import { navigate } from "./useRoute";
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const { data } = db.auth.onAuthStateChange((event, next) => {
      if (live) {
        setSession(next);
        if (!next) setProfile(null);
        if (event === "PASSWORD_RECOVERY") navigate("/reset-password", true);
      }
    });
    db.auth.getSession().then((r) => {
      if (live) {
        if (r.error) setError(r.error.message);
        setSession(r.data.session);
        setLoading(false);
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const userId = session?.user.id;
  useEffect(() => {
    let live = true;
    if (!userId) return;
    db.from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then((r) => {
        if (!live) return;
        if (r.error) setError(r.error.message);
        else {
          setProfile(r.data);
          setError("");
        }
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return {
    session,
    profile: profile?.id === userId ? profile : null,
    setProfile,
    loading: loading || (!!userId && profile?.id !== userId && !error),
    error,
  };
}
