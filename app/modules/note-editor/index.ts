import {
  noteEditorState as computeNoteEditorState,
  type NoteEditorState,
  type NoteEditorStatus,
} from "./lib/state";

export type { NoteEditorState, NoteEditorStatus };

/**
 * What the Lesson note editor shows for the Student's current draft: whether
 * it differs from the saved Note, whether Save is enabled, and the length
 * counter.
 */
export function noteEditorState(input: {
  draft: string;
  savedBody: string | null;
  isSaving: boolean;
}): NoteEditorState {
  return computeNoteEditorState(input.draft, input.savedBody, input.isSaving);
}
