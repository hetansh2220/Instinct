import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./src/routes/auth.routes.js";
import tokenRoutes from "./src/routes/token.routes.js";
import dataRoutes from "./src/routes/data.routes.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? true }));
app.use(express.json());


app.use(authRoutes);
app.use(tokenRoutes);
app.use(dataRoutes);

const port = 8080;
app.listen(port, () => {
  console.log(`Server started on ${port}`);
});
