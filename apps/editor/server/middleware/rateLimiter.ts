import rateLimit from "express-rate-limit";

export const ocrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Quá nhiều yêu cầu OCR. Vui lòng đợi 1 phút rồi thử lại.",
    code: "RATE_LIMIT",
    retryAfter: 60,
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Quá nhiều yêu cầu AI. Vui lòng đợi 1 phút rồi thử lại.",
    code: "RATE_LIMIT",
    retryAfter: 60,
  },
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Quá nhiều yêu cầu chat. Vui lòng đợi 1 phút rồi thử lại.",
    code: "RATE_LIMIT",
    retryAfter: 60,
  },
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Quá nhiều yêu cầu. Vui lòng đợi 1 phút rồi thử lại.",
    code: "RATE_LIMIT",
    retryAfter: 60,
  },
});
