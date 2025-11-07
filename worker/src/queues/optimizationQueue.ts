import { Job } from "bullmq";
import { spawn } from "child_process";
import { logger, QueueName, TQueueJobTypes } from "@langfuse/shared/src/server";
import path from "path";

export const optimizationQueueProcessor = async (
  job: Job<TQueueJobTypes[QueueName.OptimizationQueue]>,
) => {
  try {
    const { projectId } = job.data.payload;

    logger.info("Starting optimization job", {
      projectId,
      jobId: job.id,
    });

    // Path to the Python script
    const scriptPath = path.join(
      process.cwd(),
      "..",
      "scripts",
      "optimize_prompt.py",
    );

    // Execute the Python script
    await new Promise<void>((resolve, reject) => {
      const pythonProcess = spawn("python3", [scriptPath], {
        env: {
          ...process.env,
          PROJECT_ID: projectId,
        },
      });

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (data) => {
        const output = data.toString();
        stdout += output;
        logger.info("Python script output", { output });
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        logger.error("Python script error output", { error });
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          logger.info("Optimization job completed successfully", {
            projectId,
            jobId: job.id,
            stdout,
          });
          resolve();
        } else {
          logger.error("Optimization job failed", {
            projectId,
            jobId: job.id,
            code,
            stdout,
            stderr,
          });
          reject(
            new Error(
              `Python script exited with code ${code}. stderr: ${stderr}`,
            ),
          );
        }
      });

      pythonProcess.on("error", (error) => {
        logger.error("Failed to start Python script", {
          projectId,
          jobId: job.id,
          error,
        });
        reject(error);
      });
    });

    return true;
  } catch (error) {
    logger.error("Failed to process optimization job", {
      error,
      jobId: job.id,
      payload: job.data.payload,
    });
    throw error;
  }
};
