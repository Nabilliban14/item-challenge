/**
 * Local Development Server
 *
 * A simple HTTP server for testing your handlers locally.
 * Run with: pnpm dev
 */

// Load environment variables from .env file
import 'dotenv/config';

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { createItemHandler } from './handlers/create-item/index.js';
import { getItemHandler } from './handlers/get-item/index.js';
import { updateItemHandler } from './handlers/update-item/index.js';
import { createVersionHandler } from './handlers/create-version/index.js';
import { listItemsHandler } from './handlers/list-items/index.js';

const PORT = process.env.PORT || 3000;

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const { method, url } = req;

  // Parse request body
  let body = '';
  req.on('data', chunk => body += chunk);
  await new Promise(resolve => req.on('end', resolve));

  const parsedBody = body ? JSON.parse(body) : null;

  console.log(`${method} ${url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    let result;

    // Route handlers'
    if (method === 'GET' && url === '/api/items') {
      // GET /api/items - List items with query parameters
      const urlObj = new URL(url, `http://localhost:${PORT}`);
      const queryParams: Record<string, string | undefined> = {};
      urlObj.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });
      result = await listItemsHandler(queryParams);
    } else if (method === 'POST' && url === '/api/items') {
      result = await createItemHandler(parsedBody);
    } else if (method === 'POST' && url?.match(/^\/api\/items\/[^/]+\/versions$/)) {
      // POST /api/items/:id/versions
      const parts = url.split('/');
      const id = parts[3]; // /api/items/:id/versions -> parts[3] is the id
      if (id) {
        result = await createVersionHandler(id);
      } else {
        result = {
          statusCode: 400,
          body: { error: 'Item ID is required' },
        };
      }
    } else if (method === 'GET' && url?.startsWith('/api/items/') && !url.includes('/versions') && !url.includes('/audit')) {
      // GET /api/items/:id (but not /versions or /audit)
      const id = url.split('/').pop();
      if (id) {
        result = await getItemHandler(id);
      } else {
        result = {
          statusCode: 400,
          body: { error: 'Item ID is required' },
        };
      }
    } else if (method === 'PUT' && url?.startsWith('/api/items/') && !url.includes('/versions') && !url.includes('/audit')) {
      // PUT /api/items/:id (but not /versions or /audit)
      const id = url.split('/').pop();
      if (id) {
        result = await updateItemHandler(parsedBody, id);
      } else {
        result = {
          statusCode: 400,
          body: { error: 'Item ID is required' },
        };
      }
    } else {
      result = {
        statusCode: 404,
        body: { error: 'Route not found' },
      };
    }

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`\nExample endpoints:`);
  console.log(`  GET    http://localhost:${PORT}/api/items`);
  console.log(`  POST   http://localhost:${PORT}/api/items`);
  console.log(`  GET    http://localhost:${PORT}/api/items/:id`);
  console.log(`  PUT    http://localhost:${PORT}/api/items/:id`);
  console.log(`  POST   http://localhost:${PORT}/api/items/:id/versions`);
  console.log(`\nPress Ctrl+C to stop\n`);
});
