/**
 * Contract between preload (`window.api`) and renderer.
 * Each service method added in later phases gets one entry here and one IPC handler in main/ipc.ts.
 */
export type Api = Record<string, never>

export const API_KEY = 'api'
