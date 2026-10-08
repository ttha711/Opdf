import { lazy } from "react";

export const AiRewriteEditorWindow = lazy(() => import("../AiRewriteEditorWindow").then(({ AiRewriteEditorWindow }) => ({ default: AiRewriteEditorWindow })));
export const AllToolsDashboard = lazy(() => import("../AllToolsDashboard").then(({ AllToolsDashboard }) => ({ default: AllToolsDashboard })));
export const LiveHtmlEditor = lazy(() => import("../LiveHtmlEditor").then(({ LiveHtmlEditor }) => ({ default: LiveHtmlEditor })));
export const AppDocumentDialogs = lazy(() => import("./AppDocumentDialogs").then(({ AppDocumentDialogs }) => ({ default: AppDocumentDialogs })));
export const AppWorkspace = lazy(() => import("./AppWorkspace").then(({ AppWorkspace }) => ({ default: AppWorkspace })));
