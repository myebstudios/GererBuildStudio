import { describe, expect, it } from "vitest";
import { insertProjectMention, projectMentionMatches, projectMentionQueryAt, referencedProjects } from "./projectMentions";
import type { ProjectRecord } from "@/types/ogb";

const projects: ProjectRecord[] = [
  {
    id: "one",
    name: "OpenMausBot",
    mention: "openmausbot",
    path: "/work/OpenMausBot",
    source: "existing",
    addedAt: 1,
    missing: false,
  },
  {
    id: "two",
    name: "Web App",
    mention: "web-app",
    path: "/work/Web App",
    source: "created",
    addedAt: 2,
    missing: true,
  },
];

describe("projectMentionQueryAt", () => {
  it("finds a handle query at the caret", () => {
    expect(projectMentionQueryAt("Work on #open", 13)).toEqual({ start: 8, query: "open" });
    expect(projectMentionQueryAt("(#web-", 6)).toEqual({ start: 1, query: "web-" });
  });

  it("ignores embedded and completed hashtags", () => {
    expect(projectMentionQueryAt("email#open", 10)).toBeNull();
    expect(projectMentionQueryAt("Use #open now", 13)).toBeNull();
  });

  it("inserts the canonical handle without dropping trailing text", () => {
    expect(insertProjectMention("Use #op today", 7, { start: 4, query: "op" }, "openmausbot")).toEqual({
      text: "Use #openmausbot today",
      caret: 17,
    });
  });
});

describe("projectMentionMatches", () => {
  it("matches known handles case-insensitively and deduplicates references", () => {
    const text = "Check #OpenMausBot, then #web-app and #openmausbot.";
    expect(projectMentionMatches(text, projects).map((match) => match.project.id)).toEqual(["one", "two", "one"]);
    expect(referencedProjects(text, projects).map((project) => project.id)).toEqual(["one", "two"]);
  });

  it("leaves unknown and embedded hashtags alone", () => {
    expect(projectMentionMatches("Keep #general and abc#openmausbot plain", projects)).toEqual([]);
  });
});
