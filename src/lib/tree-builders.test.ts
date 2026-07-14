import { describe, it, expect } from "vitest";
import { buildFavoritesTree } from "./tree-builders";
import type { SessionMeta } from "./types";

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: "sess-1",
    provider: "claude",
    title: "Test Session",
    project_path: "/home/user/project",
    project_name: "project",
    created_at: 1711800000,
    updated_at: 1711800000,
    message_count: 5,
    file_size_bytes: 1024,
    source_path: "/home/user/.claude/projects/project/session.jsonl",
    is_sidechain: false,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    ...overrides,
  };
}

describe("buildFavoritesTree", () => {
  it("returns [] for empty input", () => {
    expect(buildFavoritesTree([], "No Project")).toEqual([]);
  });

  it("groups by provider then project", () => {
    const sessions = [
      makeSession({
        id: "s1",
        provider: "claude",
        project_name: "proj-a",
        project_path: "/a",
      }),
      makeSession({
        id: "s2",
        provider: "claude",
        project_name: "proj-a",
        project_path: "/a",
      }),
      makeSession({
        id: "s3",
        provider: "codex",
        project_name: "proj-b",
        project_path: "/b",
      }),
    ];
    const tree = buildFavoritesTree(sessions, "No Project");

    expect(tree).toHaveLength(2);

    const claudeNode = tree.find((n) => n.provider === "claude");
    expect(claudeNode).toBeDefined();
    expect(claudeNode!.node_type).toBe("provider");
    expect(claudeNode!.count).toBe(2);
    expect(claudeNode!.children).toHaveLength(1);
    expect(claudeNode!.children[0].node_type).toBe("project");
    expect(claudeNode!.children[0].children).toHaveLength(2);

    const codexNode = tree.find((n) => n.provider === "codex");
    expect(codexNode).toBeDefined();
    expect(codexNode!.count).toBe(1);
  });

  it("orders provider groups by provider sort order", () => {
    const sessions = [
      makeSession({
        id: "s1",
        provider: "kimi",
        project_name: "proj-k",
        project_path: "/k",
      }),
      makeSession({
        id: "s2",
        provider: "claude",
        project_name: "proj-c",
        project_path: "/c",
      }),
      makeSession({
        id: "s3",
        provider: "antigravity",
        project_name: "proj-g",
        project_path: "/g",
      }),
    ];

    const tree = buildFavoritesTree(sessions, "No Project");
    expect(tree.map((node) => node.provider)).toEqual([
      "claude",
      "antigravity",
      "kimi",
    ]);
  });

  it("groups cc-mirror favorites as top-level variant groups", () => {
    const sessions = [
      makeSession({
        id: "m1",
        provider: "cc-mirror",
        variant_name: "cczai",
        project_name: "proj-a",
        project_path: "/a",
      }),
      makeSession({
        id: "m2",
        provider: "cc-mirror",
        variant_name: "cczai",
        project_name: "proj-b",
        project_path: "/b",
      }),
    ];

    const tree = buildFavoritesTree(sessions, "No Project");
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe("cczai");
    expect(tree[0].node_type).toBe("provider");
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children[0].node_type).toBe("project");
  });
});
