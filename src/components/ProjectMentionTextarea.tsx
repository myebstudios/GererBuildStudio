import { useMemo, useRef, useState, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { insertProjectMention, projectMentionQueryAt } from "@/lib/projectMentions";
import { useProjects } from "@/state/projects";
import { ProjectSuggestionList } from "./ProjectSuggestionList";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange(value: string): void;
};

export function ProjectMentionTextarea({ value, onValueChange, onKeyDown, ...props }: Props) {
  const { projects } = useProjects();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  const query = projectMentionQueryAt(value, caret);
  const candidates = useMemo(() => {
    if (!query || query.start === dismissedStart) return [];
    const needle = query.query.toLowerCase();
    return (projects ?? [])
      .filter((project) => !needle || project.mention.includes(needle) || project.name.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [dismissedStart, projects, query]);

  const pick = (mention: string) => {
    if (!query) return;
    const next = insertProjectMention(value, caret, query, mention);
    onValueChange(next.text);
    setCaret(next.caret);
    setDismissedStart(query.start);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (candidates.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((current) => (current + delta + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(candidates[highlight].mention);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedStart(query?.start ?? null);
        return;
      }
    }
    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      {candidates.length > 0 && (
        <ProjectSuggestionList
          projects={candidates}
          highlight={highlight}
          onHighlight={setHighlight}
          onPick={(project) => pick(project.mention)}
          className="absolute bottom-full left-0 mb-2"
        />
      )}
      <textarea
        {...props}
        ref={inputRef}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setDismissedStart(null);
          setHighlight(0);
        }}
        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
