import express from "express";
import dotenv from "dotenv";
import { postHandler } from "./routes/postHandler";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/api/chat", postHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
