import { Router } from "express";
import ocrRouter from "./ocr";
import officeRouter from "./office";
import documentRouter from "./document";
import editingRouter from "./editing";
import chatRouter from "./chat";
import { ocrLimiter, aiLimiter, chatLimiter } from "../middleware/rateLimiter";

const apiRouter = Router();

// Apply route-specific rate limiters
apiRouter.use("/convert-page", ocrLimiter);
apiRouter.use("/generate-document", aiLimiter);
apiRouter.use("/refine-document", aiLimiter);
apiRouter.use("/edit-html", aiLimiter);
apiRouter.use("/edit-image-region", aiLimiter);
apiRouter.use("/html-to-xml", aiLimiter);
apiRouter.use("/semantic-search", aiLimiter);
apiRouter.use("/generate-formula", aiLimiter);
apiRouter.use("/refine-slide", aiLimiter);
apiRouter.use("/chat-doc", chatLimiter);

// Mount individual domain sub-routers
apiRouter.use(ocrRouter);
apiRouter.use(officeRouter);
apiRouter.use(documentRouter);
apiRouter.use(editingRouter);
apiRouter.use(chatRouter);

export default apiRouter;
