// These are isolated component/runtime tests, not live Supabase verification.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AuthPage } from "../src/features/auth/Auth";
import { PostCard } from "../src/features/posts/Posts";
import { RichText } from "../src/components/Shared";
import type { PostCardData, Profile } from "../src/types/social";
import RealApp from "../src/RealApp";

const fake = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  reset: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../src/services/social", () => ({
  db: {
    auth: {
      signInWithPassword: fake.signIn,
      signUp: fake.signUp,
      resetPasswordForEmail: fake.reset,
      updateUser: fake.update,
    },
    from: fake.from,
    rpc: fake.rpc,
  },
  check: <T,>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  },
  errorText: (e: unknown) => (e instanceof Error ? e.message : "Error"),
  mediaUrl: vi.fn(),
  profiles: vi.fn().mockResolvedValue([]),
  hydratePosts: vi.fn(),
  upload: vi.fn(),
  direct: vi.fn(),
  follow: vi.fn(),
}));
const me: Profile = {
  id: "a",
  username: "alice",
  display_name: "Alice",
  bio: "",
  avatar_url: null,
  website: null,
  is_private: false,
  is_verified: false,
  onboarding_completed: true,
  created_at: "2026-10-04T00:00:00Z",
  updated_at: "2026-10-04T00:00:00Z",
};
const post: PostCardData = {
  id: "p",
  user_id: "a",
  caption: "Hello #world",
  location: null,
  visibility: "public",
  comments_enabled: true,
  likes_hidden: false,
  created_at: me.created_at,
  updated_at: me.updated_at,
  author: me,
  media: [],
  likes: 2,
  comments: 0,
  liked: false,
  saved: false,
};
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.clearAllMocks();
  fake.rpc.mockResolvedValue({ data: true, error: null });
  history.replaceState({}, "", "/login");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value() {
      this.open = false;
    },
  });
});
afterEach(cleanup);
describe("real authentication", () => {
  it("fails closed when the required secure migration is absent, ignoring demo identity", async () => {
    localStorage.setItem(
      "ig-user",
      JSON.stringify({ id: "local-alice", username: "alice" }),
    );
    fake.rpc.mockResolvedValue({
      data: null,
      error: { message: "Function not found" },
    });
    render(<RealApp />);
    await screen.findByText("Database update required");
    expect(screen.queryByText("alice")).toBeNull();
    expect(fake.from).not.toHaveBeenCalled();
    localStorage.removeItem("ig-user");
  });
  it("sends email/password to Supabase and redirects after success", async () => {
    fake.signIn.mockResolvedValue({ data: { session: {} }, error: null });
    render(<AuthPage path="/login" />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "strong-password" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Log in" }).closest("form")!,
    );
    await waitFor(() =>
      expect(fake.signIn).toHaveBeenCalledWith({
        email: "a@example.com",
        password: "strong-password",
      }),
    );
    await waitFor(() => expect(location.pathname).toBe("/"));
  });
  it("keeps verification-pending signup on the auth screen", async () => {
    fake.signUp.mockResolvedValue({
      data: { session: null, user: { id: "a" } },
      error: null,
    });
    render(<AuthPage path="/signup" />);
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "Alice" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Sign up" }).closest("form")!,
    );
    await screen.findByText(
      "Check your email to verify your account, then log in.",
    );
    expect(location.pathname).toBe("/login");
  });
  it("shows password recovery server errors", async () => {
    fake.reset.mockResolvedValue({
      data: null,
      error: { message: "email rate limit exceeded" },
    });
    render(<AuthPage path="/forgot-password" />);
    fireEvent.submit(
      screen.getByRole("button", { name: "Send reset link" }).closest("form")!,
    );
    await screen.findByText("email rate limit exceeded");
  });
});
describe("persisted post interactions", () => {
  it("rolls a failed optimistic like back to the original count", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    fake.from.mockReturnValue({ insert: () => pending });
    render(<PostCard initial={post} me={me} />);
    fireEvent.click(screen.getByRole("button", { name: "♡ Like" }));
    expect(screen.getByText("3 likes")).toBeTruthy();
    resolve({ data: null, error: { message: "Denied" } });
    await screen.findByText("Denied");
    expect(screen.getByText("2 likes")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "♡ Like" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });
  it("does not display a composer for disabled comments", async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      range: async () => ({ data: [], error: null }),
    };
    fake.from.mockReturnValue(chain);
    render(<PostCard initial={{ ...post, comments_enabled: false }} me={me} />);
    fireEvent.click(screen.getByRole("button", { name: "Comments (0)" }));
    await screen.findByText("Comments are disabled.");
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });
  it("renders text as text and gives mentions/hashtags real routes", () => {
    render(<RichText text={"<img src=x onerror=alert(1)> @alice #world"} />);
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("link", { name: "@alice" }).getAttribute("href"),
    ).toBe("/alice");
    expect(
      screen.getByRole("link", { name: "#world" }).getAttribute("href"),
    ).toBe("/tags/world");
  });
});
