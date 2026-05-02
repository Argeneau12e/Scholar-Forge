import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supervisorsRouter from "./supervisors";
import searchRouter from "./search";
import workspaceRouter from "./workspace";
import paraphraseRouter from "./paraphrase";
import similarityRouter from "./similarity";
import citeRouter from "./cite";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supervisorsRouter);
router.use(searchRouter);
router.use(workspaceRouter);
router.use(paraphraseRouter);
router.use(similarityRouter);
router.use(citeRouter);
router.use(exportRouter);

export default router;
