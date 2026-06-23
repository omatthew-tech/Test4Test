type LogLevel = "info" | "warn" | "error" | "debug";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.DEBUG) {
      emit("debug", message, meta);
    }
  },
};
