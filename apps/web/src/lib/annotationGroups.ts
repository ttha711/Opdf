import type { Annotation } from "@opdf/core";

export interface AnnotationListItem {
  id: string;
  page: number;
  label: string;
  summary: string;
  kind: Annotation["kind"];
  groupId: string | null;
  memberIds: string[];
}

export function getAnnotationGroupId(annotation: Annotation): string | null {
  const groupId = annotation.payload?.["groupId"];
  return typeof groupId === "string" && groupId.trim().length > 0 ? groupId : null;
}

export function buildAnnotationListItems(annotations: Annotation[]): AnnotationListItem[] {
  const items: Array<{ order: number; item: AnnotationListItem }> = [];
  const grouped = new Map<string, { annotations: Annotation[]; firstIndex: number }>();

  annotations.forEach((annotation, index) => {
    const groupId = getAnnotationGroupId(annotation);
    if (!groupId) {
      items.push({ order: index, item: toListItem(annotation, null, [annotation.id]) });
      return;
    }

    const current = grouped.get(groupId);
    if (current) {
      current.annotations.push(annotation);
      return;
    }

    grouped.set(groupId, { annotations: [annotation], firstIndex: index });
  });

  for (const { annotations: groupAnnotations, firstIndex } of grouped.values()) {
    const representative =
      groupAnnotations.find((annotation) => annotation.kind === "note" && Boolean(annotation.payload?.["isPatch"])) ??
      groupAnnotations.find((annotation) => annotation.kind === "note") ??
      groupAnnotations[0];
    items.push({
      order: firstIndex,
      item: toListItem(representative, getAnnotationGroupId(representative), groupAnnotations.map((annotation) => annotation.id), groupAnnotations.length),
    });
  }

  return items
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.item);
}

function toListItem(annotation: Annotation, groupId: string | null, memberIds: string[], groupSize = 1): AnnotationListItem {
  const payload = annotation.payload as Record<string, unknown>;
  const groupKind = typeof payload["groupType"] === "string" ? payload["groupType"] : null;
  const groupLabel = typeof payload["groupLabel"] === "string" ? payload["groupLabel"] : null;
  const groupSummary = typeof payload["groupSummary"] === "string" ? payload["groupSummary"] : null;
  const textValue = typeof payload["text"] === "string" ? payload["text"] : null;
  const label = groupLabel || getKindLabel(annotation.kind);
  const summary =
    textValue ||
    groupSummary ||
    (groupKind === "text-edit" ? "Đã sửa nội dung" : "");

  return {
    id: annotation.id,
    page: annotation.page,
    label,
    summary,
    kind: annotation.kind,
    groupId,
    memberIds,
  };
}

function getKindLabel(kind: Annotation["kind"]): string {
  switch (kind) {
    case "highlight":
      return "HIGHLIGHT";
    case "underline":
      return "UNDERLINE";
    case "strike":
      return "STRIKE";
    case "note":
      return "NOTE";
    case "draw":
      return "DRAW";
    case "shape":
      return "SHAPE";
    case "signature":
      return "SIGNATURE";
    case "redact":
      return "REDACT";
    case "image":
      return "IMAGE";
    default:
      return kind;
  }
}
