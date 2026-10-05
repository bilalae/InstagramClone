export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  website: string | null;
  is_private: boolean;
  is_verified: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};
export type Post = {
  id: string;
  user_id: string;
  caption: string;
  location: string | null;
  visibility: "public" | "followers";
  comments_enabled: boolean;
  likes_hidden: boolean;
  created_at: string;
  updated_at: string;
};
export type Media = {
  id: string;
  post_id: string;
  media_url: string;
  media_type: "image" | "video";
  thumbnail_url: string | null;
  alt_text: string;
  order_index: number;
  width: number | null;
  height: number | null;
  duration: number | null;
};
export type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_comment_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};
export type Follow = {
  follower_id: string;
  following_id: string;
  status: "pending" | "accepted";
  created_at: string;
};
export type Story = {
  id: string;
  user_id: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
};
export type Reel = {
  id: string;
  post_id: string;
  video_url: string;
  audio_title: string | null;
  views: number;
  created_at: string;
};
export type Conversation = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type Member = {
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  last_read_at: string | null;
  nickname: string | null;
  muted: boolean;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  message_type:
    | "text"
    | "image"
    | "video"
    | "shared_post"
    | "shared_reel"
    | "story_reply"
    | "gif";
  body: string | null;
  media_path: string | null;
  shared_post_id: string | null;
  story_id: string | null;
  reply_to_message_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export type Notification = {
  id: string;
  user_id: string;
  actor_id: string;
  type: string;
  entity_id: string | null;
  entity_type: string | null;
  read: boolean;
  created_at: string;
};
export type Collection = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};
type Table<R, Required extends keyof R = never> = {
  Row: R;
  Insert: Partial<R> & Pick<R, Required>;
  Update: Partial<R>;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile, "id" | "username">;
      posts: Table<Post, "user_id">;
      post_media: Table<Media, "post_id" | "media_url" | "media_type">;
      comments: Table<Comment, "post_id" | "user_id" | "body">;
      follows: Table<Follow, "follower_id" | "following_id">;
      post_likes: Table<
        { user_id: string; post_id: string; created_at: string },
        "user_id" | "post_id"
      >;
      comment_likes: Table<
        { user_id: string; comment_id: string; created_at: string },
        "user_id" | "comment_id"
      >;
      saved_posts: Table<
        {
          user_id: string;
          post_id: string;
          collection_id: string | null;
          created_at: string;
        },
        "user_id" | "post_id"
      >;
      saved_collections: Table<Collection, "user_id" | "name">;
      stories: Table<Story, "user_id" | "media_url" | "media_type">;
      story_views: Table<
        { story_id: string; viewer_id: string; viewed_at: string },
        "story_id" | "viewer_id"
      >;
      story_likes: Table<
        { story_id: string; user_id: string; created_at: string },
        "story_id" | "user_id"
      >;
      story_replies: Table<
        {
          id: string;
          story_id: string;
          sender_id: string;
          body: string;
          created_at: string;
        },
        "story_id" | "sender_id" | "body"
      >;
      reels: Table<Reel, "post_id" | "video_url">;
      reel_views: Table<
        { reel_id: string; user_id: string },
        "reel_id" | "user_id"
      >;
      conversations: Table<Conversation, "created_by">;
      conversation_members: Table<Member, "conversation_id" | "user_id">;
      messages: Table<Message, "conversation_id" | "sender_id">;
      message_reactions: Table<
        {
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        },
        "message_id" | "user_id" | "emoji"
      >;
      notifications: Table<Notification, "user_id" | "actor_id" | "type">;
      blocks: Table<
        { blocker_id: string; blocked_id: string; created_at: string },
        "blocker_id" | "blocked_id"
      >;
      reports: Table<
        {
          id: string;
          reporter_id: string;
          target_type: string;
          target_id: string;
          reason: string;
          created_at: string;
        },
        "reporter_id" | "target_type" | "target_id" | "reason"
      >;
      hashtags: Table<{ id: string; name: string }, "name">;
      post_hashtags: Table<
        { post_id: string; hashtag_id: string },
        "post_id" | "hashtag_id"
      >;
      mentions: Table<
        {
          id: string;
          actor_id: string;
          mentioned_user_id: string;
          entity_id: string;
          entity_type: string;
          created_at: string;
        },
        "actor_id" | "mentioned_user_id" | "entity_id" | "entity_type"
      >;
      user_settings: Table<
        {
          user_id: string;
          appearance: "system" | "light" | "dark";
          notifications_enabled: boolean;
        },
        "user_id"
      >;
      recent_searches: Table<
        { user_id: string; query: string; created_at: string },
        "user_id" | "query"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      publish_post: {
        Args: {
          caption_text: string;
          location_text: string;
          media_items: {
            media_url: string;
            media_type: string;
            thumbnail_url: string | null;
            alt_text: string;
          }[];
          allow_comments: boolean;
          hide_likes: boolean;
          as_reel: boolean;
          audio_text: string;
        };
        Returns: string;
      };
      username_available: { Args: { candidate: string }; Returns: boolean };
      inbox_unread: {
        Args: { conversation_ids: string[] };
        Returns: { conversation_id: string; unread: number }[];
      };
      profile_posts: {
        Args: { target: string; kind: string; page_offset: number };
        Returns: Post[];
      };
      app_schema_version: { Args: Record<string, never>; Returns: number };
      post_stats: {
        Args: { post_ids: string[] };
        Returns: {
          post_id: string;
          likes: number;
          comments: number;
          liked: boolean;
        }[];
      };
      ranked_posts: {
        Args: { page_offset: number; explore: boolean };
        Returns: Post[];
      };
      get_or_create_direct_conversation: {
        Args: { target_user_id: string };
        Returns: string;
      };
      create_group: {
        Args: { group_title: string; member_ids: string[] };
        Returns: string;
      };
      manage_group: {
        Args: {
          cid: string;
          member: string;
          remove_member?: boolean;
          new_title?: string;
        };
        Returns: undefined;
      };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
export type PostCardData = Post & {
  author: Profile | null;
  media: Media[];
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
  reel?: Reel;
};
