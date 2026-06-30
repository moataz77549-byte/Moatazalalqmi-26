import { logger } from "./logger";

export function setupGlobalErrorHandling() {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    // Consider graceful shutdown or restart mechanism here
    process.exit(1); // Exit with a failure code
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at promise:", promise, "reason:", reason);
    // Optionally, do not exit for unhandled rejections if they are not critical
  });
}
