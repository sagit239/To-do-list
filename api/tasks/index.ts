import type { VercelRequest, VercelResponse } from '@vercel/node';
import { todayInZone, validateTaskInput } from '../../shared/validation.js';
import { TaskLimitError, createTask, listTasks } from '../_lib/tasksRepo.js';
import { isDbInputError, methodNotAllowed, readJsonBody, sendError, sendJson, sendServerError } from '../_lib/http.js';

async function handleCreate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = readJsonBody(req);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }
  const result = validateTaskInput(parsed.body, { today: todayInZone() });
  if (!result.ok) {
    const [first] = result.errors;
    sendError(res, 422, first.code, first.message, first.field === 'form' ? undefined : first.field);
    return;
  }
  try {
    sendJson(res, 201, await createTask(result.value));
  } catch (err) {
    if (err instanceof TaskLimitError) {
      sendError(res, 409, 'TASK_LIMIT_REACHED', 'הרשימה מלאה (1,000 משימות). יש למחוק משימה כדי להוסיף חדשה.');
    } else if (isDbInputError(err)) {
      sendError(res, 422, 'VALIDATION_ERROR', 'הנתונים שנשלחו אינם תקינים.');
    } else {
      sendServerError(res, err);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST') {
    await handleCreate(req, res);
    return;
  }
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET', 'POST']);
    return;
  }
  try {
    sendJson(res, 200, await listTasks());
  } catch (err) {
    sendServerError(res, err);
  }
}
