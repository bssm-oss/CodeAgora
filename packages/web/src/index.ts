/**
 * @codeagora/web — Web Dashboard Package
 * Exports server factory, route handlers, and WebSocket utilities.
 */

export { createApp, startServer } from './server/index.js';
export type { ServerOptions } from './server/index.js';

export { healthRoutes } from './server/routes/health.js';
export { sessionRoutes } from './server/routes/sessions.js';
export { modelRoutes } from './server/routes/models.js';
export { configRoutes } from './server/routes/config.js';
export { costRoutes } from './server/routes/costs.js';

export { setEmitters, setupWebSocket } from './server/ws.js';
export type { WebSocketSetup } from './server/ws.js';
