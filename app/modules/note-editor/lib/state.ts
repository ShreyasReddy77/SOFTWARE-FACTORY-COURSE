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
  // The action trims before it checks and stores, so judge what it will keep.
  const body = draft.trim();
  const counter = `${body.length.toLocaleString("en")} / ${MAX_NOTE_LENGTH.toLocaleString("en")}`;
  const status = statusOf(body, savedBody);
  return {
    status,
    canSave: status === "unsaved" && !isSaving,
    counter,
  };
}

function statusOf(body: string, savedBody: string | null): NoteEditorStatus {
  if (body.length > MAX_NOTE_LENGTH) return "too-long";
  if (body.length === 0) return "empty";
  if (body === savedBody) return "saved";
  return "unsaved";
}
