import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listTasks } from '../_lib/tasksRepo.js';
import { methodNotAllowed, sendJson, sendServerError } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }
  try {
    sendJson(res, 200, await listTasks());
  } catch (err) {
    sendServerError(res, err);
  }
}
