import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { projectMentionMatches } from "@/lib/projectMentions";
import { taskMentionMatches } from "@/lib/taskMentions";
import { useProjects } from "@/state/projects";
import { useStore } from "@/state/store";
import type { ProjectRecord } from "@/types/gbs";
import type { TaskRecord } from "@/lib/taskBoard";

type Segment =
  | { kind: "project"; start: number; end: number; text: string; project: ProjectRecord }
  | { kind: "task"; start: number; end: number; text: string; task: TaskRecord };

export function ProjectMentionText({ text, className }: { text: string; className?: string }) {
  const { projects, open } = useProjects();
  const { state, dispatch } = useStore();
  const projectMatches = projectMentionMatches(text, projects ?? []);
  const taskMatches = taskMentionMatches(text, state.tasks);
  const segments: Segment[] = [
    ...projectMatches.map((m): Segment => ({ kind: "project", start: m.start, end: m.end, text: m.text, project: m.project })),
    ...taskMatches.map((m): Segment => ({ kind: "task", start: m.start, end: m.end, text: m.text, task: m.task })),
  ].sort((a, b) => a.start - b.start);
  if (segments.length === 0) return <>{text}</>;

  let cursor = 0;
  return (
    <span className={className}>
      {segments.map((segment) => {
        const before = text.slice(cursor, segment.start);
        cursor = segment.end;
        if (segment.kind === "project") {
          const { project } = segment;
          return (
            <Fragment key={`p-${segment.start}-${project.id}`}>
              {before}
              <button
                type="button"
                disabled={project.missing}
                title={project.missing ? `${project.name} folder is missing` : `Open ${project.path}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void open(project).catch(() => undefined);
                }}
                className={cn(
                  "inline rounded-md bg-accent/12 px-1 py-0.5 font-medium text-accent hover:bg-accent/20",
                  project.missing && "cursor-not-allowed text-warning opacity-70",
                )}
              >
                {segment.text}
              </button>
            </Fragment>
          );
        }
        const { task } = segment;
        return (
          <Fragment key={`t-${segment.start}-${task.id}`}>
            {before}
            <button
              type="button"
              title={`${task.title} — ${task.status}`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "toggleTaskBoard", open: true });
              }}
              className="inline rounded-md bg-warning/12 px-1 py-0.5 font-medium text-warning hover:bg-warning/20"
            >
              {segment.text}
            </button>
          </Fragment>
        );
      })}
      {text.slice(cursor)}
    </span>
  );
}
