import { Request, Response, NextFunction } from "express";
import { formatGeminiError } from "../gemini";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error("[Server Error]", err.message || err);

  const statusCode = (err as any).status || (err as any).statusCode || 500;
  const formattedMessage =
    statusCode === 500
      ? "Lỗi máy chủ nội bộ. Vui lòng thử lại sau."
      : formatGeminiError(err);

  res.status(statusCode).json({
    error: formattedMessage,
    code: (err as any).code || "INTERNAL_ERROR",
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: "Không tìm thấy endpoint yêu cầu.",
    code: "NOT_FOUND",
  });
}
