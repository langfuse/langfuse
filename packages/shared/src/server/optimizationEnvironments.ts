/**
 * Optimization Environment Configuration
 *
 * Add your optimization script paths here for different environments.
 * Each environment should have a unique name and the full path to the Python script.
 */

export interface OptimizationEnvironment {
  name: string;
  scriptPath: string;
  pythonPath?: string; // Optional: override Python interpreter path
}

export const OPTIMIZATION_ENVIRONMENTS: OptimizationEnvironment[] = [
  {
    name: "Tau Bench",
    scriptPath:
      "/Users/abhishek/rotation_project/wxo-agent-evaluation/src/wxo_agentic_evaluation/optimization/tau_bench_prompt_optimization.py",
    pythonPath: "/Users/abhishek/mamba/envs/aws_sdg/bin/python",
  },
  {
    name: "SAP HR",
    scriptPath:
      "/Users/abhishek/rotation_project/wxo-agent-evaluation/src/wxo_agentic_evaluation/optimization/sap_hr_prompt_optimization.py",
    pythonPath: "/Users/abhishek/mamba/envs/aws_sdg/bin/python",
  },
  // Add more environments here:
  // {
  //   name: "My Environment",
  //   scriptPath: "/path/to/your/script.py",
  //   pythonPath: "/path/to/python", // Optional
  // },
];

// Get environment by name
export function getOptimizationEnvironment(
  name: string,
): OptimizationEnvironment | undefined {
  return OPTIMIZATION_ENVIRONMENTS.find((env) => env.name === name);
}

// Get default environment (first one)
export function getDefaultOptimizationEnvironment(): OptimizationEnvironment {
  if (OPTIMIZATION_ENVIRONMENTS.length === 0) {
    throw new Error("No optimization environments configured");
  }
  return OPTIMIZATION_ENVIRONMENTS[0];
}
