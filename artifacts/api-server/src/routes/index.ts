import { Router, type IRouter } from "express";
import healthRouter from "./health";
import supervisorsRouter from "./supervisors";
import searchRouter from "./search";
import workspaceRouter from "./workspace";

const router: IRouter = Router();

router.use(healthRouter);
router.use(supervisorsRouter);
router.use(searchRouter);
router.use(workspaceRouter);

export default router;
