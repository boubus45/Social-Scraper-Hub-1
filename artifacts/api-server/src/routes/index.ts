import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import postRouter from "./post";
import apifyRouter from "./apify";
import { isPublicPath, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
// After sign-in: every other API call carries `Authorization: Bearer <token>`
// and is rejected without it (see isPublicPath for the exceptions).
router.use((req, res, next) => {
  if (isPublicPath(req.path)) return next();
  return requireAuth(req, res, next);
});
router.use(oauthRouter);
router.use(postRouter);
router.use("/apify", apifyRouter);

export default router;
