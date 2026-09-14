import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instagramMonitorsRouter from "./instagramMonitors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instagramMonitorsRouter);

export default router;
