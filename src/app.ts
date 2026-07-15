import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mensajeRoutes from "./routes/mensaje.routes";
import { verifyToken } from "./middlewares/auth.middleware";

dotenv.config();

const app = express();

// Middlewares
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (sin autenticación, usado por Docker/orquestador)
app.get("/health", (req, res) => {
  res.json({ status: "UP", service: "MsMensajeria" });
});

// Validación de JWT en cada petición HTTP
app.use(verifyToken);

// Rutas
app.use("/api/mensajes", mensajeRoutes);

export default app;
