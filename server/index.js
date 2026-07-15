import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import authRoutes from "./src/routes/auth.routes.js";
import tokenRoutes from "./src/routes/token.routes.js";
import dataRoutes from "./src/routes/data.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import roomRoutes from "./src/routes/room.routes.js";
import contestRoutes from "./src/routes/contest.routes.js";
import predictionRoutes from "./src/routes/prediction.routes.js";
import { DbConnection } from "./src/config/db.js";
import { attachSocket } from "./src/socket.js";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? true }));
app.use(express.json());


app.use(authRoutes);
app.use(tokenRoutes);
app.use(dataRoutes);
app.use(userRoutes);
app.use(roomRoutes);
app.use(contestRoutes);
app.use(predictionRoutes);


const server = createServer(app);
attachSocket(server);


const port = process.env.PORT || 8080;

server.listen(port, async () => {
  console.log(`Server started on ${port}`);
  await DbConnection();
});
