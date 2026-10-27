import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TASK_LIMIT } from '../../shared/validation.js';
import { OrderConflictError, reorderTasks } from '../_lib/tasksRepo.js';
import {
  ORDER_BODY_LIMIT,
  isUuid,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
  sendServerError,
} from '../_lib/http.js';

function isValidOrder(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= TASK_LIMIT &&
    value.every(isUuid) &&
    new Set(value.map((id) => id.toLowerCase())).size === value.length
  );
}

/** PUT /api/tasks/order – replaces the list order with the full list of ids the client knows (ADR-9). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PUT') {
    methodNotAllowed(res, ['PUT']);
    return;
  }
  const parsed = readJsonBody(req, ORDER_BODY_LIMIT);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }
  const { orderedIds } = parsed.body;
  if (!isValidOrder(orderedIds)) {
    sendError(res, 400, 'INVALID_ORDER', 'סדר המשימות שנשלח אינו תקין.');
    return;
  }
  try {
    sendJson(res, 200, await reorderTasks(orderedIds));
  } catch (err) {
    if (err instanceof OrderConflictError) {
      sendError(res, 409, 'ORDER_CONFLICT', 'רשימת המשימות השתנתה בינתיים. רעננו את הרשימה ונסו שוב.');
    } else {
      sendServerError(res, err);
    }
  }
}
