import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLobstersData } from "../lobsters.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLobstersData", () => {
  it("maps the API string submitter_user into the story author", async () => {
    const payload = [
      {
        short_id: "jjap0n",
        title: "You could have come up with Kimi Delta Attention",
        url: "https://blog.doubleword.ai/you-could-have-come-up-with-kimi-delta-attention",
        comments_url: "https://lobste.rs/s/jjap0n/you_could_have_come_up_with_kimi_delta",
        score: 42,
        comment_count: 8,
        submitter_user: "alice",
        created_at: "2026-07-31T12:00:00Z",
        tags: ["ai"],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const result = await fetchLobstersData("2026-07-27T00:00:00Z");

    expect(result.fetchSuccess).toBe(true);
    expect(result.stories).toHaveLength(1);
    expect(result.stories[0]?.author).toBe("alice");
  });
});
