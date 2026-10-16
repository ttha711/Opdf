const revisionKeys = new WeakMap<ArrayBuffer, string>();
let nextRevisionId = 0;

export function getNativeEditRevisionKey(buffer: ArrayBuffer) {
  const cached = revisionKeys.get(buffer);
  if (cached) return cached;
  const key = `native-edit-revision-${++nextRevisionId}`;
  revisionKeys.set(buffer, key);
  return key;
}

export function setNativeEditRevisionKey(buffer: ArrayBuffer, key: string) {
  revisionKeys.set(buffer, key);
  return key;
}
