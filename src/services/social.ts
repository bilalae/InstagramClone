import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Database, Post, PostCardData, Profile } from "../types/social";
export const db = supabase as SupabaseClient<Database>;
export function check<
  R extends { data: unknown; error: { message: string } | null },
>(result: R): Exclude<R, { error: { message: string } }>["data"] {
  if (result.error) throw new Error(result.error.message);
  return result.data as Exclude<R, { error: { message: string } }>["data"];
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
export async function profiles(ids: string[]): Promise<Profile[]> {
  return ids.length
    ? check(
        await db
          .from("profiles")
          .select("*")
          .in("id", [...new Set(ids)]),
      )
    : [];
}
export async function hydratePosts(
  rows: Post[],
  me: string,
): Promise<PostCardData[]> {
  if (!rows.length) return [];
  const ids = rows.map((p) => p.id);
  const [authors, media, saves, reels, stats] = await Promise.all([
    profiles(rows.map((p) => p.user_id)),
    db
      .from("post_media")
      .select("*")
      .in("post_id", ids)
      .order("order_index")
      .then(check),
    db
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", me)
      .in("post_id", ids)
      .then(check),
    db.from("reels").select("*").in("post_id", ids).then(check),
    db.rpc("post_stats", { post_ids: ids }).then(check),
  ]);
  return rows.map((p) => ({
    ...p,
    author: authors.find((a) => a.id === p.user_id) || null,
    media: media.filter((m) => m.post_id === p.id),
    saved: saves.some((s) => s.post_id === p.id),
    reel: reels.find((r) => r.post_id === p.id),
    likes: 0,
    comments: 0,
    liked: false,
    ...stats.find((s) => s.post_id === p.id),
  }));
}
export function objectPath(value: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  return value.includes(marker)
    ? decodeURIComponent(value.split(marker)[1])
    : value;
}
export async function mediaUrl(value: string, bucket: string) {
  if (!value) return "";
  const path = objectPath(value, bucket);
  if (/^https?:/.test(path)) {
    if (bucket !== "avatars")
      throw new Error(
        "External media is not supported. Upload this media again.",
      );
    return path;
  }
  if (bucket === "avatars")
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return check(await db.storage.from(bucket).createSignedUrl(path, 120))
    .signedUrl;
}
const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
export async function upload(file: File, bucket: string, me: string) {
  const ext = mimeExtensions[file.type];
  if (!ext || (bucket === "avatars" && !file.type.startsWith("image/")))
    throw new Error("Choose JPEG, PNG, WebP, GIF, MP4, WebM, or MOV media.");
  if (
    !file.size ||
    file.size > (file.type.startsWith("video/") ? 100 : 25) * 1024 * 1024
  )
    throw new Error("Images must be under 25 MB and videos under 100 MB.");
  const path = `${me}/${crypto.randomUUID()}.${ext}`;
  check(
    await db.storage
      .from(bucket)
      .upload(path, file, { upsert: false, contentType: file.type }),
  );
  return path;
}
export async function follow(me: string, target: Profile, status?: string) {
  if (status)
    check(
      await db
        .from("follows")
        .delete()
        .eq("follower_id", me)
        .eq("following_id", target.id),
    );
  else
    check(
      await db.from("follows").insert({
        follower_id: me,
        following_id: target.id,
        status: target.is_private ? "pending" : "accepted",
      }),
    );
  window.dispatchEvent(
    new CustomEvent("ig-follow-change", {
      detail: {
        target: target.id,
        status: status ? undefined : target.is_private ? "pending" : "accepted",
      },
    }),
  );
}
export async function direct(target: string) {
  return check(
    await db.rpc("get_or_create_direct_conversation", {
      target_user_id: target,
    }),
  );
}

// Storage objects must be removed through Storage's API, not by deleting metadata in SQL.
export async function removeOwnedMedia(me: string) {
  for (const bucket of ["avatars", "posts", "reels", "stories", "messages"]) {
    const clean = async (folder: string): Promise<void> => {
      for (;;) {
        const objects = check(
          await db.storage.from(bucket).list(folder, { limit: 100, offset: 0 }),
        );
        if (!objects.length) break;
        const files = objects
          .filter((o) => o.id)
          .map((o) => `${folder}/${o.name}`);
        if (files.length) check(await db.storage.from(bucket).remove(files));
        for (const child of objects.filter((o) => !o.id))
          await clean(`${folder}/${child.name}`);
        // Folders disappear when emptied; refuse an unexpected non-progressing listing.
        if (!files.length && !objects.some((o) => !o.id)) break;
      }
    };
    await clean(me);
  }
}
