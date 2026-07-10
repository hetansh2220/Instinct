import { Router } from "express";
import { getUser, upsertUser } from "../controllers/user.controller.js";

const router = Router();

router.get("/api/users/:wallet", getUser);
router.post("/api/users", upsertUser);

export default router;
