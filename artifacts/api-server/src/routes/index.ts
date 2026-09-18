import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instagramMonitorsRouter from "./instagramMonitors";
import redditMonitorsRouter from "./redditMonitors";
import facebookMonitorsRouter from "./facebookMonitors";
import oauthRouter from "./oauth";
import postRouter from "./post";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instagramMonitorsRouter);
router.use(redditMonitorsRouter);
router.use(facebookMonitorsRouter);
router.use(oauthRouter);
router.use(postRouter);

export default router;
