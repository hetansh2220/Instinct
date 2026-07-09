import { Router } from "express";
import { guestStart } from "../controllers/auth.controller.js";

const router = Router();

router.post("/auth/guest/start", guestStart);

export default router;
