import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { projectMentionMatches } from "@/lib/projectMentions";
import { useProjects } from "@/state/projects";

export function ProjectMentionText({ text, className }: { text: string; className?: string }) {
  const { projects, open } = useProjects();
  const matches = projectMentionMatches(text, projects ?? []);
  if (matches.length === 0) return <>{text}</>;

  let cursor = 0;
  return (
    <span className={className}>
      {matches.map((match) => {
        const before = text.slice(cursor, match.start);
        cursor = match.end;
        return (
          <Fragment key={`${match.start}-${match.project.id}`}>
            {before}
            <button
              type="button"
              disabled={match.project.missing}
              title={match.project.missing ? `${match.project.name} folder is missing` : `Open ${match.project.path}`}
              onClick={(event) => {
                event.stopPropagation();
                void open(match.project).catch(() => undefined);
              }}
              className={cn(
                "inline rounded-md bg-accent/12 px-1 py-0.5 font-medium text-accent hover:bg-accent/20",
                match.project.missing && "cursor-not-allowed text-warning opacity-70",
              )}
            >
              {match.text}
            </button>
          </Fragment>
        );
      })}
      {text.slice(cursor)}
    </span>
  );
}
