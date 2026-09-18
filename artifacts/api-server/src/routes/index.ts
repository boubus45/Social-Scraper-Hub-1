import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instagramMonitorsRouter from "./instagramMonitors";
import redditMonitorsRouter from "./redditMonitors";
import facebookMonitorsRouter from "./facebookMonitors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instagramMonitorsRouter);
router.use(redditMonitorsRouter);
router.use(facebookMonitorsRouter);

export default router;
