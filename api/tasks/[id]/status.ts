import type { VercelRequest, VercelResponse } from '@vercel/node';
import { TaskNotFoundError, setTaskStatus } from '../../_lib/tasksRepo.js';
import { isUuid, methodNotAllowed, readJsonBody, sendError, sendJson, sendServerError } from '../../_lib/http.js';

const NOT_FOUND_MESSAGE = 'המשימה לא נמצאה. ייתכן שנמחקה בידי מבקר אחר – רעננו את הדף.';

/** PATCH /api/tasks/:id/status – saves an explicit `completed` value (not a toggle). */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH') {
    methodNotAllowed(res, ['PATCH']);
    return;
  }
  const id = req.query?.id;
  if (!isUuid(id)) {
    sendError(res, 400, 'INVALID_ID', 'מזהה המשימה אינו תקין.');
    return;
  }
  const parsed = readJsonBody(req);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }
  const { completed } = parsed.body;
  if (typeof completed !== 'boolean') {
    sendError(res, 400, 'INVALID_STATUS', 'יש לשלוח סטטוס תקין.');
    return;
  }
  try {
    sendJson(res, 200, await setTaskStatus(id, completed));
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      sendError(res, 404, 'TASK_NOT_FOUND', NOT_FOUND_MESSAGE);
    } else {
      sendServerError(res, err);
    }
  }
}
