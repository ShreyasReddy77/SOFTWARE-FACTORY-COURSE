import { describe, it, expect } from "vitest";
import { noteEditorState } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("noteEditorState", () => {
  it("is empty and unsaveable before the Student writes anything", () => {
    expect(
      noteEditorState({ draft: "", savedBody: null, isSaving: false })
    ).toEqual({ status: "empty", canSave: false, counter: "0 / 2,000" });
  });

  it("treats a whitespace-only draft as empty", () => {
    const state = noteEditorState({
      draft: "  \n ",
      savedBody: null,
      isSaving: false,
    });
    expect(state.status).toBe("empty");
    expect(state.canSave).toBe(false);
  });

  it("lets the Student save a new draft", () => {
    expect(
      noteEditorState({ draft: "Use Result", savedBody: null, isSaving: false })
    ).toEqual({ status: "unsaved", canSave: true, counter: "10 / 2,000" });
  });

  it("is saved when the draft matches the saved Note", () => {
    const state = noteEditorState({
      draft: "Use Result",
      savedBody: "Use Result",
      isSaving: false,
    });
    expect(state.status).toBe("saved");
    expect(state.canSave).toBe(false);
  });

  it("is unsaved when the draft differs from the saved Note", () => {
    const state = noteEditorState({
      draft: "Use Result types",
      savedBody: "Use Result",
      isSaving: false,
    });
    expect(state.status).toBe("unsaved");
    expect(state.canSave).toBe(true);
  });

  it("blocks a second save while one is in flight", () => {
    const state = noteEditorState({
      draft: "Use Result",
      savedBody: null,
      isSaving: true,
    });
    expect(state.status).toBe("unsaved");
    expect(state.canSave).toBe(false);
  });

  it("allows a draft of exactly the maximum length", () => {
    const state = noteEditorState({
      draft: "a".repeat(MAX_NOTE_LENGTH),
      savedBody: null,
      isSaving: false,
    });
    expect(state.status).toBe("unsaved");
    expect(state.counter).toBe("2,000 / 2,000");
  });

  it("blocks a draft over the maximum length", () => {
    const state = noteEditorState({
      draft: "a".repeat(MAX_NOTE_LENGTH + 1),
      savedBody: null,
      isSaving: false,
    });
    expect(state).toEqual({
      status: "too-long",
      canSave: false,
      counter: "2,001 / 2,000",
    });
  });

  it("is saved after saving a draft with edge whitespace, which the action trims", () => {
    const state = noteEditorState({
      draft: "Use Result\n",
      savedBody: "Use Result",
      isSaving: false,
    });
    expect(state.status).toBe("saved");
    expect(state.canSave).toBe(false);
  });

  it("allows a draft at the maximum length plus edge whitespace", () => {
    const state = noteEditorState({
      draft: `${"a".repeat(MAX_NOTE_LENGTH)} `,
      savedBody: null,
      isSaving: false,
    });
    expect(state.status).toBe("unsaved");
    expect(state.counter).toBe("2,000 / 2,000");
  });
});
