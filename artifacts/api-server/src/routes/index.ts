import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instagramMonitorsRouter from "./instagramMonitors";
import redditMonitorsRouter from "./redditMonitors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instagramMonitorsRouter);
router.use(redditMonitorsRouter);

export default router;
