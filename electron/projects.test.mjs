import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectService, parseGitHubRepositoryUrl, projectMentionSlug } from "./projects.mjs";

describe("ProjectService", () => {
  let root;
  let dataDir;
  let workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "omb-projects-"));
    dataDir = path.join(root, "app-data");
    workspace = path.join(root, "workspace");
    await mkdir(workspace);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("registers an existing directory once using its canonical path", async () => {
    const projectPath = path.join(workspace, "existing-project");
    await mkdir(projectPath);
    const service = new ProjectService({ dataDir });

    const first = await service.addExisting(projectPath);
    const duplicate = await service.addExisting(path.join(projectPath, "."));

    expect(duplicate.id).toBe(first.id);
    await expect(service.list()).resolves.toEqual([{ ...first, missing: false }]);
    const stored = JSON.parse(await readFile(path.join(dataDir, "projects.json"), "utf8"));
    expect(stored).toHaveLength(1);
    expect(first.mention).toBe("existing-project");
  });

  it("creates a safe child directory and registers it", async () => {
    const service = new ProjectService({ dataDir });

    const project = await service.createProject({ parentPath: workspace, name: "new-project" });

    expect(project).toMatchObject({ name: "new-project", source: "created", missing: false });
    await expect(service.assertRegistered(path.join(workspace, "new-project"))).resolves.toMatchObject({
      id: project.id,
    });
  });

  it.each(["", ".", "..", "nested/folder", "nested\\folder", "CON", "trailing."])(
    "rejects unsafe folder name %j",
    async (name) => {
      const service = new ProjectService({ dataDir });
      await expect(service.createProject({ parentPath: workspace, name })).rejects.toThrow();
    },
  );

  it("keeps malformed persistence unchanged", async () => {
    await mkdir(dataDir);
    const projectsFile = path.join(dataDir, "projects.json");
    await writeFile(projectsFile, "{not valid json", "utf8");
    const service = new ProjectService({ dataDir });

    await expect(service.list()).rejects.toThrow("Saved project data is invalid");
    expect(await readFile(projectsFile, "utf8")).toBe("{not valid json");
  });

  it("marks a registered project missing without dropping its record", async () => {
    const projectPath = path.join(workspace, "movable-project");
    await mkdir(projectPath);
    const service = new ProjectService({ dataDir });
    const project = await service.addExisting(projectPath);

    await rm(projectPath, { recursive: true });

    await expect(service.list()).resolves.toEqual([{ ...project, missing: true }]);
  });

  it("assigns deterministic unique mention slugs", async () => {
    const firstPath = path.join(workspace, "First", "Same Project");
    const secondPath = path.join(workspace, "Second", "Same Project");
    await mkdir(firstPath, { recursive: true });
    await mkdir(secondPath, { recursive: true });
    const service = new ProjectService({ dataDir });

    const first = await service.addExisting(firstPath);
    const second = await service.addExisting(secondPath);

    expect(first.mention).toBe("same-project");
    expect(second.mention).toBe("same-project-2");
    await expect(service.list()).resolves.toEqual([
      { ...second, missing: false },
      { ...first, missing: false },
    ]);
  });

  it("atomically migrates legacy records without changing their identity", async () => {
    await mkdir(dataDir);
    const projectPath = path.join(workspace, "Legacy App");
    await mkdir(projectPath);
    const legacy = {
      id: "legacy-id",
      name: "Legacy App",
      path: projectPath,
      source: "existing",
      addedAt: 123,
    };
    await writeFile(path.join(dataDir, "projects.json"), `${JSON.stringify([legacy], null, 2)}\n`, "utf8");
    const service = new ProjectService({ dataDir });

    await expect(service.list()).resolves.toEqual([{ ...legacy, mention: "legacy-app", missing: false }]);
    const stored = JSON.parse(await readFile(path.join(dataDir, "projects.json"), "utf8"));
    expect(stored).toEqual([{ ...legacy, mention: "legacy-app" }]);
  });

  it("clones with normalized GitHub input and registers only after success", async () => {
    const cloneRepository = vi.fn(async ({ destinationPath }) => {
      await mkdir(destinationPath);
    });
    const service = new ProjectService({ dataDir, cloneRepository });
    const destinationPath = path.join(workspace, "openmausbot-copy");

    const project = await service.cloneProject({
      repositoryUrl: "https://github.com/example/openmausbot",
      destinationPath,
    });

    expect(cloneRepository).toHaveBeenCalledWith({
      repositoryUrl: "https://github.com/example/openmausbot.git",
      destinationPath: project.path,
    });
    expect(project).toMatchObject({ source: "github", name: "openmausbot-copy", missing: false });
  });

  it("retains a partial clone folder and does not register a failed clone", async () => {
    const destinationPath = path.join(workspace, "partial-clone");
    const service = new ProjectService({
      dataDir,
      cloneRepository: async () => {
        await mkdir(destinationPath);
        throw new Error("authentication failed");
      },
    });

    await expect(
      service.cloneProject({ repositoryUrl: "git@github.com:example/private.git", destinationPath }),
    ).rejects.toThrow("authentication failed");
    await expect(readFile(path.join(dataDir, "projects.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(destinationPath)).resolves.toMatchObject({});
  });
});

describe("projectMentionSlug", () => {
  it.each([
    ["OpenMausBot", "openmausbot"],
    ["My Project", "my-project"],
    ["Crème brûlée", "creme-brulee"],
    ["---", "project"],
  ])("turns %j into %j", (name, mention) => {
    expect(projectMentionSlug(name)).toBe(mention);
  });
});

describe("parseGitHubRepositoryUrl", () => {
  it("accepts HTTPS and SSH GitHub repositories", () => {
    expect(parseGitHubRepositoryUrl("https://github.com/owner/repository")).toEqual({
      repositoryUrl: "https://github.com/owner/repository.git",
      folderName: "repository",
    });
    expect(parseGitHubRepositoryUrl("git@github.com:owner/repository.git")).toEqual({
      repositoryUrl: "git@github.com:owner/repository.git",
      folderName: "repository",
    });
  });

  it.each([
    "http://github.com/owner/repository",
    "https://gitlab.com/owner/repository",
    "https://user:token@github.com/owner/repository",
    "https://github.com/owner",
    "file:///tmp/repository",
  ])("rejects unsupported repository URL %s", (repositoryUrl) => {
    expect(() => parseGitHubRepositoryUrl(repositoryUrl)).toThrow();
  });
});
