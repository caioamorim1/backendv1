import { Router } from "express";
import { DebugController } from "../controllers/debugController";

const router = Router();
const ctrl = new DebugController();

// GET /debug/uploads - Informações sobre sistema de uploads
router.get("/uploads", ctrl.getUploadInfo);

export default router;
