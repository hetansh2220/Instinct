import { Router } from "express";
import { activate } from "../controllers/token.controller.js";

const router = Router();

router.post("/api/token/activate", activate);

export default router;
