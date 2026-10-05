type NativeContentHistoryControls = {
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

let activeControls: NativeContentHistoryControls | null = null;

export function registerNativeContentHistoryControls(controls: NativeContentHistoryControls) {
  activeControls = controls;
  return () => {
    if (activeControls === controls) activeControls = null;
  };
}

export function undoNativeContentEdit() {
  return activeControls?.undo();
}

export function redoNativeContentEdit() {
  return activeControls?.redo();
}

export function canUndoNativeContentEdit() {
  return Boolean(activeControls?.canUndo());
}

export function canRedoNativeContentEdit() {
  return Boolean(activeControls?.canRedo());
}
