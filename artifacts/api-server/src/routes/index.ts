import { Router, type IRouter } from "express";
import healthRouter from "./health";
import instagramMonitorsRouter from "./instagramMonitors";
import redditMonitorsRouter from "./redditMonitors";
import facebookMonitorsRouter from "./facebookMonitors";
import oauthRouter from "./oauth";
import postRouter from "./post";
import brightDataRouter, { webhookRouter } from "./brightData";

const router: IRouter = Router();

router.use(healthRouter);
router.use(instagramMonitorsRouter);
router.use(redditMonitorsRouter);
router.use(facebookMonitorsRouter);
router.use(oauthRouter);
router.use(postRouter);
// Bright Data lives under /api/brightdata/… — the webhook path is fixed by
// BRIGHTDATA_WEBHOOK_URL, so it is mounted separately.
router.use("/webhooks", webhookRouter);
router.use("/brightdata", brightDataRouter);

export default router;
