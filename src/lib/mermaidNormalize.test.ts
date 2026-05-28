import { describe, expect, it } from "vitest";
import { normalizeMermaidCode } from "./mermaidNormalize";

describe("normalizeMermaidCode", () => {
  it("auto-quotes bare Chinese title/axis/quadrant on quadrantChart", () => {
    const input = `quadrantChart
    title 鉴权方案优先级
    x-axis 实现成本 --> 高
    y-axis 低收益 --> 高收益
    quadrant-1 重点投入
    quadrant-2 优先落地
    quadrant-3 暂缓
    quadrant-4 可选
    "OAuth2 + OIDC": [0.82, 0.9]`;
    const out = normalizeMermaidCode(input);
    expect(out).toContain('title "鉴权方案优先级"');
    expect(out).toContain('x-axis "实现成本" --> "高"');
    expect(out).toContain('y-axis "低收益" --> "高收益"');
    expect(out).toContain('quadrant-1 "重点投入"');
    expect(out).toContain('quadrant-2 "优先落地"');
    // Already-quoted point labels untouched.
    expect(out).toContain('"OAuth2 + OIDC": [0.82, 0.9]');
  });

  it("leaves already-quoted axis labels untouched", () => {
    const input = `quadrantChart
    title "Investment Matrix"
    x-axis "Low cost" --> "High cost"`;
    const out = normalizeMermaidCode(input);
    expect(out).toBe(input);
  });

  it("leaves pure-ASCII identifiers unquoted (mermaid handles them)", () => {
    const input = `quadrantChart
    title Reach
    x-axis Low --> High
    quadrant-1 Adopt`;
    const out = normalizeMermaidCode(input);
    // No quotes added around bare ASCII tokens — mermaid handles those.
    expect(out).toBe(input);
  });

  it("does not touch flowchart sources", () => {
    const input = `flowchart TD
    A[客户端] --> B[业务 API]
    B -->|查询| C[数据库]`;
    expect(normalizeMermaidCode(input)).toBe(input);
  });

  it("handles single-token x-axis (no `-->`)", () => {
    const input = `quadrantChart
    title "Risk"
    x-axis 实施成本`;
    const out = normalizeMermaidCode(input);
    expect(out).toContain('x-axis "实施成本"');
  });

  it("escapes embedded quotes and backslashes", () => {
    const input = `quadrantChart
    title 中文 with "quote" and \\backslash`;
    const out = normalizeMermaidCode(input);
    expect(out).toContain('title "中文 with \\"quote\\" and \\\\backslash"');
  });

  it("only normalises lines whose keyword is on the allowlist", () => {
    // `accTitle` (accessibility title) and other unrelated keywords pass through.
    const input = `quadrantChart
    accTitle: 鉴权方案
    title "好的"`;
    const out = normalizeMermaidCode(input);
    expect(out).toContain("accTitle: 鉴权方案");
    expect(out).toContain('title "好的"');
  });

  it("auto-quotes bare-Chinese point labels", () => {
    const input = `quadrantChart
    title "鉴权矩阵"
    x-axis "低" --> "高"
    y-axis "低" --> "高"
    quadrant-1 "重点"
    quadrant-2 "落地"
    quadrant-3 "暂缓"
    quadrant-4 "可选"
    MCP注入: [0.45, 0.7]
    "OAuth2 + OIDC": [0.82, 0.9]
    令牌伪造: [0.2, 0.75]`;
    const out = normalizeMermaidCode(input);
    expect(out).toContain('"MCP注入": [0.45, 0.7]');
    expect(out).toContain('"令牌伪造": [0.2, 0.75]');
    // Already-quoted labels remain untouched.
    expect(out).toContain('"OAuth2 + OIDC": [0.82, 0.9]');
  });

  it("leaves pure-ASCII point labels unquoted", () => {
    const input = `quadrantChart
    title "X"
    foo: [0.5, 0.5]`;
    expect(normalizeMermaidCode(input)).toBe(input);
  });

  it("returns input unchanged for non-quadrantChart code", () => {
    const input = `sequenceDiagram
    title 时序图
    A->>B: hi`;
    expect(normalizeMermaidCode(input)).toBe(input);
  });
});
