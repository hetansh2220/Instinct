import { Router } from "express";
import {
    predictMatch,
    predictWindow,
    matchPointsLeaderboard,
} from "../controllers/prediction.controller.js";

const router = Router();

router.post("/api/predictions/match", predictMatch);
router.post("/api/predictions/window", predictWindow);
router.get("/api/leaderboard/:matchId", matchPointsLeaderboard);

export default router;
