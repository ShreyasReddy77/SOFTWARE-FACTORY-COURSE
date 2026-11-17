import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { noteEditorState, type NoteEditorStatus } from "~/modules/note-editor";

/**
 * The Student's private Note on a Lesson. Laid out like the Questions &
 * Discussion card so the two read as one family on the Lesson page.
 */
export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const { status, canSave, counter } = noteEditorState({
    draft,
    savedBody: note?.body ?? null,
    isSaving: fetcher.state !== "idle",
  });
  const error = fetcher.state === "idle" ? fetcher.data?.error : undefined;

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NoteHeading />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={4}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What stood out in this lesson?"
            aria-label="Your notes"
            className="min-h-24 resize-y"
          />

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!canSave}>
              {fetcher.state !== "idle" ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus status={status} error={error} note={note} />
            <span
              className={cn(
                "ml-auto text-xs",
                status === "too-long"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {counter}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteHeading() {
  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <p className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" />
        Private to you. Jot things down while you watch.
      </p>
    </>
  );
}

function NoteStatus({
  status,
  error,
  note,
}: {
  status: NoteEditorStatus;
  error: string | undefined;
  note: { updatedAt: string } | null;
}) {
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (status === "unsaved") {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (status === "empty" && note) {
    return (
      <span className="text-xs text-muted-foreground">
        A note cannot be empty. Your saved note is kept.
      </span>
    );
  }
  if (status === "saved" && note) {
    return (
      <span suppressHydrationWarning className="text-xs text-muted-foreground">
        Saved · edited {formatRelativeTime(note.updatedAt)}
      </span>
    );
  }
  return null;
}
