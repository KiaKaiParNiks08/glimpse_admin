import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct Postgres connection. The running app can keep the pooled DATABASE_URL.
    url: process.env.DIRECT_URL?.trim() || env("DATABASE_URL"),
  },
});
