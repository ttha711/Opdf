import { randomUUID } from "node:crypto";
import type {
  Annotation,
  AnnotationCreateInput,
} from "../types/index.js";

interface AnnotationState {
  annotations: Annotation[];
  undoStack: Annotation[][];
  redoStack: Annotation[][];
  lastCommittedGroupKey: string | null;
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
      lastCommittedGroupKey: null,
    };

    this.stateByDocument.set(documentId, initial);
    return initial;
  }

  list(documentId: string): Annotation[] {
    return [...this.getState(documentId).annotations];
  }

  replace(documentId: string, annotations: Annotation[]): Annotation[] {
    const state = this.getState(documentId);
    state.annotations = this.cloneAnnotations(annotations);
    state.undoStack = [];
    state.redoStack = [];
    state.lastCommittedGroupKey = null;
    return this.list(documentId);
  }

  create(documentId: string, input: AnnotationCreateInput): Annotation {
    const state = this.getState(documentId);
    this.commitSnapshot(state, this.getGroupKey(input.payload));

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
    const target = state.annotations.find((a) => a.id === id);
    if (!target) {
      return false;
    }

    this.commitSnapshot(state, this.getGroupKey(target.payload));

    const groupKey = this.getGroupKey(target.payload);
    if (groupKey) {
      state.annotations = state.annotations.filter((a) => this.getGroupKey(a.payload) !== groupKey);
    } else {
      state.annotations = state.annotations.filter((a) => a.id !== id);
    }
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
    state.lastCommittedGroupKey = null;
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
    state.lastCommittedGroupKey = null;
    return state.annotations;
  }

  private commitSnapshot(state: AnnotationState, groupKey?: string | null): void {
    if (groupKey && state.lastCommittedGroupKey === groupKey) {
      return;
    }

    state.undoStack.push(this.cloneAnnotations(state.annotations));
    if (state.undoStack.length > 50) {
      state.undoStack.shift();
    }
    state.redoStack = [];
    state.lastCommittedGroupKey = groupKey ?? null;
  }

  private cloneAnnotations(items: Annotation[]): Annotation[] {
    return items.map((item) => ({ ...item, payload: { ...item.payload } }));
  }

  private getGroupKey(payload: Record<string, unknown>): string | null {
    const groupId = payload.groupId;
    return typeof groupId === "string" && groupId.trim().length > 0 ? groupId : null;
  }
}
