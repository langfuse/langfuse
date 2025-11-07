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
    console.log(`\n========================================`);
    console.log(`🚀 Starting Prompt Optimization`);
    console.log(`Project ID: ${projectId}`);
    console.log(`Job ID: ${job.id}`);
    console.log(`========================================\n`);

    // Path to the Python script
    // const scriptPath = path.join(
    //   process.cwd(),
    //   "..",
    //   "scripts",
    //   "optimize_prompt.py",
    // );
    const scriptPath =
      "/Users/abhishek/rotation_project/wxo-agent-evaluation/src/wxo_agentic_evaluation/optimization/tau_bench_prompt_optimization.py";
    // Execute the Python script using the aws_sdg mamba environment's Python
    // Direct path to the Python interpreter in the mamba environment
    const pythonPath = "/Users/abhishek/mamba/envs/aws_sdg/bin/python";

    await new Promise<void>((resolve, reject) => {
      const pythonProcess = spawn(pythonPath, [scriptPath], {
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
        // Log to both logger and console for immediate visibility
        console.log(`[Python Output] ${output.trim()}`);
        logger.info("Python script output", { output });
      });

      pythonProcess.stderr.on("data", (data) => {
        const error = data.toString();
        stderr += error;
        // Log to both logger and console for immediate visibility
        console.error(`[Python Error] ${error.trim()}`);
        logger.error("Python script error output", { error });
      });

      pythonProcess.on("close", (code) => {
        console.log(`\n========================================`);
        if (code === 0) {
          console.log(`✅ Optimization job completed successfully!`);
          console.log(`Exit code: ${code}`);
          console.log(`========================================\n`);
          logger.info("Optimization job completed successfully", {
            projectId,
            jobId: job.id,
            stdout,
          });
          resolve();
        } else {
          console.log(`❌ Optimization job failed`);
          console.log(`Exit code: ${code}`);
          console.log(`STDOUT:\n${stdout}`);
          console.log(`STDERR:\n${stderr}`);
          console.log(`========================================\n`);
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
        console.error(`\n❌ Failed to start Python process:`);
        console.error(error);
        console.log(`========================================\n`);
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
