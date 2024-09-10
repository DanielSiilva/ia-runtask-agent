"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const postHandler_1 = require("./routes/postHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Use o CORS para aceitar requisições de qualquer origem
app.use((0, cors_1.default)({
    origin: "*", // Aceitar requisições de qualquer lugar
    methods: ["GET", "POST", "PUT", "DELETE"], // Métodos permitidos
    allowedHeaders: ["Content-Type", "Authorization"], // Cabeçalhos permitidos
}));
app.use(express_1.default.json());
app.post("/api/chat", postHandler_1.postHandler);
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
