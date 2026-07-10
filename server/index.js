import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./src/routes/auth.routes.js";
import tokenRoutes from "./src/routes/token.routes.js";
import dataRoutes from "./src/routes/data.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import { DbConnection } from "./src/config/db.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? true }));
app.use(express.json());


app.use(authRoutes);
app.use(tokenRoutes);
app.use(dataRoutes);
app.use(userRoutes);

const port = 8080;
app.listen(port, async () => {
  console.log(`Server started on ${port}`);
  await DbConnection();
});
