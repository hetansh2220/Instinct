import { Router } from "express";
import { fixtures, odds, scores, scoresHistorical, finalScores } from "../controllers/data.controller.js";

const router = Router();

router.get("/api/fixtures/snapshot", fixtures);
router.get("/api/odds/snapshot/:fixtureId", odds);
router.get("/api/scores/snapshot/:fixtureId", scores);
router.get("/api/scores/historical/:fixtureId", scoresHistorical);
router.post("/api/scores/final", finalScores);

export default router;
