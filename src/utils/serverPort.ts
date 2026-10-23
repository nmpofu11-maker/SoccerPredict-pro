const SOCCERPREDICT_PORT = 3001;

/** Resolve the app port without ever routing SoccerPredict-pro to the separate app on 3000. */
export function resolveListenPort(args: string[], configuredPort?: string): number {
  const portArgIndex = args.indexOf('--port');
  if (portArgIndex !== -1 && args[portArgIndex + 1]) {
    const parsed = Number(args[portArgIndex + 1]);
    if (Number.isInteger(parsed) && parsed > 0 && parsed !== 3000) return parsed;
    if (parsed === 3000) return SOCCERPREDICT_PORT;
  }

  const envPort = Number(configuredPort);
  if (Number.isInteger(envPort) && envPort > 0 && envPort !== 8080 && envPort !== 3000) {
    return envPort;
  }

  return SOCCERPREDICT_PORT;
}
