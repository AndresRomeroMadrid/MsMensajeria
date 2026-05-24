import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || "5432"),
  ssl:
    process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

pool.on("connect", () => {
  console.log("✅ Base de datos conectada exitosamente");
});

pool.on("error", (err) => {
  console.error("❌ Error inesperado en la base de datos:", err);
});

export default pool;
