import { randomUUID } from "node:crypto";
import type {
  Annotation,
  AnnotationCreateInput,
} from "../types/index.js";

interface AnnotationState {
  annotations: Annotation[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];
}

export class AnnotationService {
  private readonly stateByDocument = new Map<string, AnnotationState>();

  private getState(documentId: string): AnnotationState {
    const current = this.stateByDocument.get(documentId);
    if (current) {
      return current;
    }

    const initial: AnnotationState = {
      annotations: [],
      undoStack: [],
      redoStack: [],
    };

    this.stateByDocument.set(documentId, initial);
    return initial;
  }

  list(documentId: string): Annotation[] {
    return [...this.getState(documentId).annotations];
  }

  create(documentId: string, input: AnnotationCreateInput): Annotation {
    const state = this.getState(documentId);
    this.commitSnapshot(state);

    const now = Date.now();
    const item: Annotation = {
      id: randomUUID(),
      page: input.page,
      kind: input.kind,
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
    };

    state.annotations = [...state.annotations, item];
    return item;
  }

  update(documentId: string, id: string, payload: Record<string, unknown>): Annotation | null {
    const state = this.getState(documentId);
    const idx = state.annotations.findIndex((a) => a.id === id);
    if (idx < 0) {
      return null;
    }

    this.commitSnapshot(state);
    const current = state.annotations[idx];
    const updated: Annotation = {
      ...current,
      payload: { ...current.payload, ...payload },
      updatedAt: Date.now(),
    };

    state.annotations = [
      ...state.annotations.slice(0, idx),
      updated,
      ...state.annotations.slice(idx + 1),
    ];

    return updated;
  }

  delete(documentId: string, id: string): boolean {
    const state = this.getState(documentId);
    const next = state.annotations.filter((a) => a.id !== id);
    if (next.length === state.annotations.length) {
      return false;
    }

    this.commitSnapshot(state);
    state.annotations = next;
    return true;
  }

  undo(documentId: string): Annotation[] {
    const state = this.getState(documentId);
    const previous = state.undoStack.pop();
    if (!previous) {
      return state.annotations;
    }

    state.redoStack.push(this.cloneAnnotations(state.annotations));
    state.annotations = previous;
    return state.annotations;
  }

  redo(documentId: string): Annotation[] {
    const state = this.getState(documentId);
    const next = state.redoStack.pop();
    if (!next) {
      return state.annotations;
    }

    state.undoStack.push(this.cloneAnnotations(state.annotations));
    state.annotations = next;
    return state.annotations;
  }

  private commitSnapshot(state: AnnotationState): void {
    state.undoStack.push(this.cloneAnnotations(state.annotations));
    state.redoStack = [];
  }

  private cloneAnnotations(items: Annotation[]): Annotation[] {
    return items.map((item) => ({ ...item, payload: { ...item.payload } }));
  }
}