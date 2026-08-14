import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectRecord } from "@/types/gbs";

function projectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "");
}

interface ProjectsContextValue {
  available: boolean;
  projects: ProjectRecord[] | null;
  error: string | null;
  refreshing: boolean;
  refresh(quiet?: boolean): Promise<void>;
  upsert(project: ProjectRecord): void;
  open(project: ProjectRecord): Promise<void>;
  reportError(error: unknown): void;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const projectsApi = window.gbs?.projects;
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!projectsApi) {
      setProjects([]);
      return;
    }
    if (quiet) setRefreshing(true);
    else setProjects(null);
    setError(null);
    try {
      setProjects(await projectsApi.list());
    } catch (reason) {
      setError(projectErrorMessage(reason));
      setProjects([]);
    } finally {
      setRefreshing(false);
    }
  }, [projectsApi]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<ProjectsContextValue>(() => ({
    available: Boolean(projectsApi),
    projects,
    error,
    refreshing,
    refresh,
    upsert(project) {
      setProjects((current) => [project, ...(current ?? []).filter((item) => item.id !== project.id)]);
      setError(null);
    },
    async open(project) {
      if (!projectsApi) return;
      try {
        await projectsApi.open(project.path);
      } catch (reason) {
        setError(projectErrorMessage(reason));
        throw reason;
      }
    },
    reportError(reason) {
      setError(projectErrorMessage(reason));
    },
  }), [error, projects, projectsApi, refresh, refreshing]);

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const value = useContext(ProjectsContext);
  if (!value) throw new Error("useProjects must be used inside ProjectsProvider");
  return value;
}
