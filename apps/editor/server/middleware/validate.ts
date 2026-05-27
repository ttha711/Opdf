import { Request, Response, NextFunction } from "express";

interface ValidationRule {
  field: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  min?: number;
  max?: number;
  message?: string;
}

export function validate(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const rule of rules) {
      const value = req.body[rule.field];

      if (value === undefined || value === null) {
        if (rule.required) {
          return res.status(400).json({
            error: rule.message || `Thiếu trường bắt buộc: ${rule.field}`,
            code: "MISSING_FIELD",
          });
        }
        continue;
      }

      const actualType = Array.isArray(value) ? "array" : typeof value;
      if (actualType !== rule.type) {
        return res.status(400).json({
          error: rule.message || `Trường ${rule.field} phải là kiểu ${rule.type}, nhận được ${actualType}`,
          code: "INVALID_TYPE",
        });
      }

      if (rule.type === "string" && typeof value === "string") {
        if (rule.min !== undefined && value.length < rule.min) {
          return res.status(400).json({
            error: rule.message || `Trường ${rule.field} phải có ít nhất ${rule.min} ký tự`,
            code: "TOO_SHORT",
          });
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return res.status(400).json({
            error: rule.message || `Trường ${rule.field} không được vượt quá ${rule.max} ký tự`,
            code: "TOO_LONG",
          });
        }
      }

      if (rule.type === "number" && typeof value === "number") {
        if (rule.min !== undefined && value < rule.min) {
          return res.status(400).json({
            error: rule.message || `Trường ${rule.field} phải >= ${rule.min}`,
            code: "TOO_SMALL",
          });
        }
        if (rule.max !== undefined && value > rule.max) {
          return res.status(400).json({
            error: rule.message || `Trường ${rule.field} phải <= ${rule.max}`,
            code: "TOO_LARGE",
          });
        }
      }

      if (rule.type === "array" && Array.isArray(value)) {
        if (rule.min !== undefined && value.length < rule.min) {
          return res.status(400).json({
            error: rule.message || `Mảng ${rule.field} phải có ít nhất ${rule.min} phần tử`,
            code: "ARRAY_TOO_SHORT",
          });
        }
        if (rule.max !== undefined && value.length > rule.max) {
          return res.status(400).json({
            error: rule.message || `Mảng ${rule.field} không được vượt quá ${rule.max} phần tử`,
            code: "ARRAY_TOO_LONG",
          });
        }
      }
    }
    next();
  };
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "");
}
