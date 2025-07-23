import { env } from "../env";
import winston from "winston";
import { getCurrentSpan } from "./instrumentation";
import { propagation, context } from "@opentelemetry/api";
import fs from "node:fs";
import path from "node:path";

const tracingFormat = function () {
  return winston.format((info) => {
    const span = getCurrentSpan();
    if (span) {
      const { spanId, traceId } = span.spanContext();
      const traceIdEnd = traceId.slice(traceId.length / 2);
      info["dd.trace_id"] = BigInt(`0x${traceIdEnd}`).toString();
      info["dd.span_id"] = BigInt(`0x${spanId}`).toString();
      info["trace_id"] = traceId;
      info["span_id"] = spanId;
    }
    const baggage = propagation.getBaggage(context.active());
    if (baggage) {
      const headerObj: Record<string, string> = {};
      baggage.getAllEntries().forEach(([k, v]) => (headerObj[k] = v.value));
      if (Object.keys(headerObj).length) info = { ...headerObj, ...info };
    }
    return info;
  })();
};

const getServiceName = (): string => {
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return packageJson.name === "web"
      ? "web"
      : packageJson.name === "worker"
        ? "worker"
        : "unknown";
  } catch (error) {
    return "unknown";
  }
};

const createLogFilePath = (serviceName: string): string => {
  // file cache shares log file path across all processes
  const cacheDir = path.resolve(process.cwd(), "..", "logs", ".cache");
  const cacheFile = path.join(cacheDir, `${serviceName}_current.log`);
  const pidFile = path.join(cacheDir, `${serviceName}_session.pid`);

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  // Check if a log file path is already cached
  try {
    if (fs.existsSync(cacheFile) && fs.existsSync(pidFile)) {
      const cachedPid = fs.readFileSync(pidFile, "utf8").trim();
      const currentPid = process.ppid?.toString() || process.pid.toString(); // Use parent PID if available

      // reuse the log file if from same session
      if (cachedPid === currentPid) {
        const cachedPath = fs.readFileSync(cacheFile, "utf8").trim();
        if (cachedPath && fs.existsSync(cachedPath)) {
          return cachedPath;
        }
      }
      // Different session - clear cache and create new file
    }
  } catch (error) {
    // Continue to create new file if cache read fails
  }

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .split(".")[0];
  const filename = `${timestamp}_${serviceName}.log`;

  const logDir = path.resolve(process.cwd(), "..", "logs", serviceName);
  const latestDir = path.resolve(process.cwd(), "..", "logs", "latest");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(latestDir)) {
    fs.mkdirSync(latestDir, { recursive: true });
  }

  const logFilePath = path.join(logDir, filename);
  const symlinkPath = path.join(latestDir, `${serviceName}.log`);

  // Create/update symlink to latest log file
  try {
    if (fs.existsSync(symlinkPath)) {
      fs.unlinkSync(symlinkPath);
    }
    fs.symlinkSync(path.relative(latestDir, logFilePath), symlinkPath);
  } catch (error) {
    // Ignore symlink errors
  }

  // cache the path and PID
  try {
    const currentPid = process.ppid?.toString() || process.pid.toString();
    fs.writeFileSync(cacheFile, logFilePath);
    fs.writeFileSync(pidFile, currentPid);
  } catch (error) {
    // Ignore cache write errors
  }

  return logFilePath;
};

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
  const textLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => {
      const logMessage = `${info.timestamp} ${info.level} ${info.message}`;
      return info.stack ? `${logMessage}\n${info.stack}` : logMessage;
    }),
  );

  const jsonLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    tracingFormat(),
    winston.format.json(),
  );

  const format =
    env.LANGFUSE_LOG_FORMAT === "text" ? textLoggerFormat : jsonLoggerFormat;

  const transports: winston.transport[] = [new winston.transports.Console()];

  // Add file transport for development
  if (nodeEnv === "development") {
    const serviceName = getServiceName();
    const logFilePath = createLogFilePath(serviceName);

    transports.push(
      new winston.transports.File({
        filename: logFilePath,
        format: format,
      }),
    );
  }

  return winston.createLogger({
    level: minLevel,
    format: format,
    transports: transports,
  });
};

export const logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
