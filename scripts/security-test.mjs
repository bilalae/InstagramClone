import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create schema auth; create schema storage; create schema realtime;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
create table realtime.messages(id uuid,topic text);alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql as $$select current_setting('realtime.topic',true)$$;
create publication supabase_realtime;
grant usage on schema public,auth,storage,realtime to authenticated,anon;
alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
`);
for (const name of fs.readdirSync("supabase/migrations").sort()) {
  const sql = fs
    .readFileSync(`supabase/migrations/${name}`, "utf8")
    .replace('create extension if not exists "pgcrypto";', "");
  await pg.exec(sql);
  console.log(`Applied ${name}`);
}
const a = "00000000-0000-0000-0000-000000000001",
  b = "00000000-0000-0000-0000-000000000002",
  c = "00000000-0000-0000-0000-000000000003";
await pg.query(
  `insert into auth.users(id,raw_user_meta_data) values($1,'{"username":"qa_a"}'),($2,'{"username":"qa_b"}'),($3,'{"username":"qa_c"}')`,
  [a, b, c],
);
const as = async (id) => {
  await pg.exec("reset role");
  await pg.query(`select set_config('request.jwt.claim.sub',$1,false)`, [id]);
  await pg.exec("set role authenticated");
};
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function denied(sql, params = []) {
  let failed = false;
  try {
    await pg.query(sql, params);
  } catch {
    failed = true;
  }
  assert.equal(failed, true, "Expected database rejection");
}
await as(a);
const post = (
  await pg.query(
    `insert into posts(user_id,caption) values($1,'Hello #test @qa_b') returning id`,
    [a],
  )
).rows[0].id;
await test("profile automatically created", async () =>
  assert.equal(
    (await pg.query("select username from profiles where id=$1", [a])).rows[0]
      .username,
    "qa_a",
  ));
await test("cannot self verify", () =>
  denied("update profiles set is_verified=true where id=$1", [a]));
await pg.query("update profiles set is_private=true where id=$1", [a]);
await as(b);
await test("private posts hidden", async () =>
  assert.equal(
    (await pg.query("select * from posts where id=$1", [post])).rows.length,
    0,
  ));
await test("cannot like private post", () =>
  denied("insert into post_likes(user_id,post_id) values($1,$2)", [b, post]));
await test("cannot force accepted private follow", () =>
  denied("insert into follows values($1,$2,'accepted',now())", [b, a]));
await pg.query(
  "insert into follows(follower_id,following_id,status) values($1,$2,'pending')",
  [b, a],
);
await test("cannot accept own request", () =>
  denied("update follows set status='accepted' where follower_id=$1", [
    b,
  ]).catch(() => {
    throw new Error("unexpected");
  })).catch(async () => {
  assert.equal(
    (await pg.query("select status from follows where follower_id=$1", [b]))
      .rows[0].status,
    "pending",
  );
  console.log("PASS own request update affected zero rows");
});
await as(a);
await pg.query(
  "update follows set status='accepted' where follower_id=$1 and following_id=$2",
  [b, a],
);
await as(b);
await test("accepted follower sees private post", async () =>
  assert.equal(
    (await pg.query("select * from posts where id=$1", [post])).rows.length,
    1,
  ));
await pg.query("insert into post_likes(user_id,post_id) values($1,$2)", [
  b,
  post,
]);
await pg.query("insert into comments(user_id,post_id,body) values($1,$2,$3)", [
  b,
  post,
  "Hello @qa_a",
]);
await pg.query("insert into saved_posts(user_id,post_id) values($1,$2)", [
  b,
  post,
]);
const cid = (
  await pg.query("select get_or_create_direct_conversation($1) id", [a])
).rows[0].id;
await test("membership query is nonrecursive", async () =>
  assert.equal(
    (
      await pg.query(
        "select * from conversation_members where conversation_id=$1",
        [cid],
      )
    ).rows.length,
    2,
  ));
await pg.query(
  "insert into messages(conversation_id,sender_id,body) values($1,$2,'hello')",
  [cid, b],
);
await as(c);
await test("outsider cannot read chat", async () =>
  assert.equal(
    (await pg.query("select * from messages where conversation_id=$1", [cid]))
      .rows.length,
    0,
  ));
await test("outsider cannot join chat", () =>
  denied(
    "insert into conversation_members(conversation_id,user_id) values($1,$2)",
    [cid, c],
  ));
await test("saved content private", async () =>
  assert.equal((await pg.query("select * from saved_posts")).rows.length, 0));
await as(a);
await test("notifications persisted", async () =>
  assert.ok((await pg.query("select * from notifications")).rows.length >= 2));
await test("cannot impersonate sender", () =>
  denied(
    "insert into messages(conversation_id,sender_id,body) values($1,$2,'fake')",
    [cid, b],
  ));
await pg.query("insert into blocks(blocker_id,blocked_id) values($1,$2)", [
  a,
  b,
]);
await as(b);
await test("block hides profile", async () =>
  assert.equal(
    (await pg.query("select * from profiles where id=$1", [a])).rows.length,
    0,
  ));
await test("block hides post", async () =>
  assert.equal(
    (await pg.query("select * from posts where id=$1", [post])).rows.length,
    0,
  ));
await test("block removes follow", async () =>
  assert.equal((await pg.query("select * from follows")).rows.length, 0));
await test("block prevents messaging", () =>
  denied(
    "insert into messages(conversation_id,sender_id,body) values($1,$2,'blocked')",
    [cid, b],
  ));
await test("block prevents conversation RPC", () =>
  denied("select get_or_create_direct_conversation($1)", [a]));
await as(a);
await pg.query("delete from blocks where blocker_id=$1 and blocked_id=$2", [
  a,
  b,
]);
await pg.query("update profiles set is_private=false where id=$1", [a]);
await test("schema capability version", async () =>
  assert.equal((await pg.query("select app_schema_version() v")).rows[0].v, 5));
await test("reserved username unavailable", async () =>
  assert.equal(
    (await pg.query("select username_available('settings') v")).rows[0].v,
    false,
  ));
await test("existing username unavailable to another user", async () => {
  await as(b);
  assert.equal(
    (await pg.query("select username_available('QA_A') v")).rows[0].v,
    false,
  );
  await as(a);
});
await test("media cannot reference another owner folder", () =>
  denied(
    "insert into post_media(post_id,media_url,media_type) values($1,$2,'image')",
    [post, b + "/secret.png"],
  ));
await pg.query(
  "insert into post_media(post_id,media_url,media_type) values($1,$2,'video')",
  [post, a + "/video.mp4"],
);
const reel = (
  await pg.query(
    "insert into reels(post_id,video_url) values($1,$2) returning id",
    [post, a + "/video.mp4"],
  )
).rows[0].id;
await test("reels have a readable policy", async () => {
  await as(b);
  assert.equal(
    (await pg.query("select * from reels where id=$1", [reel])).rows.length,
    1,
  );
});
await pg.query("insert into reel_views(reel_id,user_id) values($1,$2)", [
  reel,
  b,
]);
await test("reel views counted once per user", async () => {
  await denied("insert into reel_views(reel_id,user_id) values($1,$2)", [
    reel,
    b,
  ]);
  assert.equal(
    Number(
      (await pg.query("select views from reels where id=$1", [reel])).rows[0]
        .views,
    ),
    1,
  );
});
await test("cannot edit another profile", async () =>
  assert.equal(
    (await pg.query("update profiles set bio='intrusion' where id=$1", [a]))
      .affectedRows,
    0,
  ));
await test("cannot delete another post", async () =>
  assert.equal(
    (await pg.query("delete from posts where id=$1", [post])).affectedRows,
    0,
  ));
await test("duplicate follows impossible", async () => {
  await pg.query(
    "insert into follows(follower_id,following_id,status) values($1,$2,'accepted')",
    [b, a],
  );
  await denied(
    "insert into follows(follower_id,following_id,status) values($1,$2,'accepted')",
    [b, a],
  );
});
await as(a);
await pg.query("update posts set comments_enabled=false where id=$1", [post]);
await as(b);
await test("disabled comments enforced by database", () =>
  denied(
    "insert into comments(post_id,user_id,body) values($1,$2,'forbidden')",
    [post, b],
  ));
await as(a);
await pg.query("update posts set comments_enabled=true where id=$1", [post]);
const otherPost = (
  await pg.query(
    "insert into posts(user_id,caption) values($1,'Another') returning id",
    [a],
  )
).rows[0].id;
const parent = (
  await pg.query(
    "insert into comments(post_id,user_id,body) values($1,$2,'parent') returning id",
    [otherPost, a],
  )
).rows[0].id;
await as(b);
await test("comment reply must reference same post", () =>
  denied(
    "insert into comments(post_id,user_id,body,parent_comment_id) values($1,$2,'reply',$3)",
    [post, b, parent],
  ));
await test("cannot delete another comment", async () =>
  assert.equal(
    (await pg.query("delete from comments where id=$1", [parent])).affectedRows,
    0,
  ));
const col = (
  await pg.query(
    "insert into saved_collections(user_id,name) values($1,'Favorites') returning id",
    [b],
  )
).rows[0].id;
await as(a);
await test("collection content is owner private", async () =>
  assert.equal(
    (await pg.query("select * from saved_collections where id=$1", [col])).rows
      .length,
    0,
  ));
await test("cannot assign save to another collection", () =>
  denied(
    "insert into saved_posts(user_id,post_id,collection_id) values($1,$2,$3)",
    [a, post, col],
  ));
const story = (
  await pg.query(
    "insert into stories(user_id,media_url,media_type) values($1,$2,'image') returning id",
    [a, a + "/story.png"],
  )
).rows[0].id;
await as(b);
await pg.query("insert into story_views(story_id,viewer_id) values($1,$2)", [
  story,
  b,
]);
await pg.query("insert into story_likes(story_id,user_id) values($1,$2)", [
  story,
  b,
]);
await test("story viewers cannot impersonate others", () =>
  denied("insert into story_views(story_id,viewer_id) values($1,$2)", [
    story,
    c,
  ]));
await as(a);
await test("owner reads story viewer list", async () =>
  assert.equal(
    (await pg.query("select * from story_views where story_id=$1", [story]))
      .rows.length,
    1,
  ));
await pg.exec("reset role");
await pg.query(
  "update stories set expires_at=now()-interval '1 second' where id=$1",
  [story],
);
await as(b);
await test("expired stories hidden", async () =>
  assert.equal(
    (await pg.query("select * from stories where id=$1", [story])).rows.length,
    0,
  ));
await test("expired stories reject interactions", () =>
  denied("insert into story_likes(story_id,user_id) values($1,$2)", [
    story,
    b,
  ]));
await as(a);
const group = (
  await pg.query(
    "select create_group('QA group',array[$1::uuid,$2::uuid]) id",
    [b, c],
  )
).rows[0].id;
await as(b);
await test("group member cannot remove another member", () =>
  denied("select manage_group($1,$2,true)", [group, c]));
await test("member cannot promote self", () =>
  denied(
    "update conversation_members set role='admin' where conversation_id=$1 and user_id=$2",
    [group, b],
  ));
await as(a);
await pg.query("select manage_group($1,$2,true)", [group, c]);
await as(c);
await test("removed member loses group access", async () =>
  assert.equal(
    (await pg.query("select * from conversations where id=$1", [group])).rows
      .length,
    0,
  ));
await as(a);
const otherMessage = (
  await pg.query(
    "insert into messages(conversation_id,sender_id,body) values($1,$2,'group only') returning id",
    [group, a],
  )
).rows[0].id;
await test("reply cannot cross conversations", () =>
  denied(
    "insert into messages(conversation_id,sender_id,body,reply_to_message_id) values($1,$2,'bad reply',$3)",
    [cid, a, otherMessage],
  ));
await test("message cannot borrow another user media", () =>
  denied(
    "insert into messages(conversation_id,sender_id,message_type,media_path) values($1,$2,'image',$3)",
    [cid, a, b + "/secret.png"],
  ));
await test("direct conversation creation idempotent", async () =>
  assert.equal(
    (await pg.query("select get_or_create_direct_conversation($1) id", [b]))
      .rows[0].id,
    cid,
  ));
await test("notification updates cannot change actor", () =>
  denied("update notifications set actor_id=$1 where user_id=$2", [c, a]));
await test("report persistence", async () => {
  await pg.query(
    "insert into reports(reporter_id,target_type,target_id,reason) values($1,'post',$2,'Test report')",
    [a, post],
  );
  await pg.exec("reset role");
  assert.equal(
    (await pg.query("select * from reports where reporter_id=$1", [a])).rows
      .length,
    1,
  );
  await as(a);
});
await test("storage insert folder scoped", () =>
  denied("insert into storage.objects(bucket_id,name) values('posts',$1)", [
    b + "/stolen.png",
  ]));
await pg.query(
  "insert into storage.objects(bucket_id,name) values('posts',$1)",
  [a + "/video.mp4"],
);
await as(b);
await test("authorized media is readable", async () =>
  assert.equal(
    (
      await pg.query("select * from storage.objects where name=$1", [
        a + "/video.mp4",
      ])
    ).rows.length,
    1,
  ));
await test("cannot delete other user media", async () =>
  assert.equal(
    (
      await pg.query("delete from storage.objects where name=$1", [
        a + "/video.mp4",
      ])
    ).affectedRows,
    0,
  ));
await as(a);
await pg.query("insert into blocks(blocker_id,blocked_id) values($1,$2)", [
  a,
  b,
]);
await as(b);
await test("storage access respects blocking", async () =>
  assert.equal(
    (
      await pg.query("select * from storage.objects where name=$1", [
        a + "/video.mp4",
      ])
    ).rows.length,
    0,
  ));
await as(a);
await test("batched post counts", async () =>
  assert.equal(
    (await pg.query("select * from post_stats(array[$1::uuid])", [post])).rows
      .length,
    1,
  ));
await test("ranked feed executes under RLS", async () =>
  assert.ok(
    (await pg.query("select * from ranked_posts(0,false)")).rows.length >= 2,
  ));
await test("profile reel query", async () =>
  assert.equal(
    (await pg.query("select * from profile_posts($1,'reels',0)", [a])).rows
      .length,
    1,
  ));
await test("blocked group excluded from unread query", async () =>
  assert.equal(
    (await pg.query("select * from inbox_unread(array[$1::uuid])", [group]))
      .rows.length,
    0,
  ));
await pg.query("delete from blocks where blocker_id=$1 and blocked_id=$2", [
  a,
  b,
]);
await test("batched inbox unread query", async () =>
  assert.equal(
    (await pg.query("select * from inbox_unread(array[$1::uuid])", [group]))
      .rows.length,
    1,
  ));
await as(c);
await test("account deletion removes own auth user and profile", async () => {
  await pg.query("select delete_my_account()");
  await pg.exec("reset role");
  assert.equal(
    (await pg.query("select * from auth.users where id=$1", [c])).rows.length,
    0,
  );
  assert.equal(
    (await pg.query("select * from profiles where id=$1", [c])).rows.length,
    0,
  );
});
await as(a);
await test("atomic carousel publishing persists ordered media and hashtags", async () => {
  const media = [
    { media_url: a + "/first.png", media_type: "image", alt_text: "First" },
    { media_url: a + "/second.mp4", media_type: "video", alt_text: "Second" },
  ];
  const id = (
    await pg.query(
      "select publish_post('Carousel #atomic','New York',$1::jsonb) id",
      [JSON.stringify(media)],
    )
  ).rows[0].id;
  assert.equal(
    (
      await pg.query(
        "select * from post_media where post_id=$1 order by order_index",
        [id],
      )
    ).rows.length,
    2,
  );
  assert.equal(
    (await pg.query("select * from post_hashtags where post_id=$1", [id])).rows
      .length,
    1,
  );
});
await test("failed media validation rolls back whole post transaction", async () => {
  const before = (await pg.query("select count(*)::int n from posts")).rows[0]
    .n;
  await denied("select publish_post('Invalid','',$1::jsonb)", [
    JSON.stringify([{ media_url: b + "/stolen.png", media_type: "image" }]),
  ]);
  assert.equal(
    (await pg.query("select count(*)::int n from posts")).rows[0].n,
    before,
  );
});
await test("notification preference suppresses mention and interaction notifications", async () => {
  await pg.query(
    "insert into user_settings(user_id,notifications_enabled) values($1,false)",
    [a],
  );
  const before = (await pg.query("select count(*)::int n from notifications"))
    .rows[0].n;
  await as(b);
  await pg.query(
    "insert into comments(user_id,post_id,body) values($1,$2,'@qa_a check notifications')",
    [b, post],
  );
  await as(a);
  assert.equal(
    (await pg.query("select count(*)::int n from notifications")).rows[0].n,
    before,
  );
});
console.log(`${passed} security assertions passed`);
await pg.close();
