import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supervisorsRouter from "./supervisors";
import searchRouter from "./search";
import workspaceRouter from "./workspace";
import paraphraseRouter from "./paraphrase";
import similarityRouter from "./similarity";
import citeRouter from "./cite";
import exportRouter from "./export";
import gapsRouter from "./gaps";
import litreviewRouter from "./litreview";
import argmapRouter from "./argmap";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supervisorsRouter);
router.use(searchRouter);
router.use(workspaceRouter);
router.use(paraphraseRouter);
router.use(similarityRouter);
router.use(citeRouter);
router.use(exportRouter);
router.use(gapsRouter);
router.use(litreviewRouter);
router.use(argmapRouter);

export default router;
