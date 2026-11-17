import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteEditorStatus = "empty" | "saved" | "unsaved" | "too-long";

export type NoteEditorState = {
  status: NoteEditorStatus;
  canSave: boolean;
  counter: string;
};

export function noteEditorState(
  draft: string,
  savedBody: string | null,
  isSaving: boolean
): NoteEditorState {
  const counter = `${draft.length.toLocaleString("en")} / ${MAX_NOTE_LENGTH.toLocaleString("en")}`;
  const status = statusOf(draft, savedBody);
  return {
    status,
    canSave: status === "unsaved" && !isSaving,
    counter,
  };
}

function statusOf(draft: string, savedBody: string | null): NoteEditorStatus {
  if (draft.length > MAX_NOTE_LENGTH) return "too-long";
  // Saving whitespace is rejected by the action, so it counts as empty.
  if (draft.trim().length === 0) return "empty";
  if (draft === savedBody) return "saved";
  return "unsaved";
}
