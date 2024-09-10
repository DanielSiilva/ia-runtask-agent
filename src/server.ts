import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { postHandler } from "./routes/postHandler";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Use o CORS para aceitar requisições de qualquer origem
app.use(
  cors({
    origin: "*", // Aceitar requisições de qualquer lugar
    methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
    allowedHeaders: ["Content-Type", "Authorization"], // Cabeçalhos permitidos
  })
);

app.use(express.json());

app.post("/api/chat", postHandler);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
