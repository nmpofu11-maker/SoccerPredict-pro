const SOCCERPREDICT_PORT = 3001;

/** Resolve the app port without ever routing SoccerPredict-pro to the separate app on 3000 on local machines, while honoring AI Studio and standalone Cloud Run ports. */
export function resolveListenPort(
  args: string[],
  configuredPort?: string,
  env?: Record<string, string | undefined>
): number {
  const defaultAppPort = Number(env?.DEFAULT_APP_PORT);
  if (Number.isInteger(defaultAppPort) && defaultAppPort > 0) {
    return defaultAppPort;
  }

  if (env?.K_SERVICE && !env?.NGINX_PORT) {
    const cloudRunPort = Number(configuredPort);
    if (Number.isInteger(cloudRunPort) && cloudRunPort > 0) {
      return cloudRunPort;
    }
  }

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
