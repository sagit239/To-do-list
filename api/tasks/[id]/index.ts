import type { VercelRequest, VercelResponse } from '@vercel/node';
import { todayInZone } from '../../../shared/validation.js';
import { TaskNotFoundError, deleteTask, updateTaskDetails } from '../../_lib/tasksRepo.js';
import {
  isDbInputError,
  isUuid,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
  sendNoContent,
  sendServerError,
} from '../../_lib/http.js';

const NOT_FOUND_MESSAGE = 'המשימה לא נמצאה. ייתכן שנמחקה בידי מבקר אחר – רעננו את הדף.';
const EDITABLE_FIELDS = ['title', 'description', 'dueDate'] as const;

function sendNotFound(res: VercelResponse): void {
  sendError(res, 404, 'TASK_NOT_FOUND', NOT_FOUND_MESSAGE);
}

async function handleUpdate(id: string, req: VercelRequest, res: VercelResponse): Promise<void> {
  const parsed = readJsonBody(req);
  if (!parsed.ok) {
    sendError(res, parsed.status, parsed.code, parsed.message);
    return;
  }
  // All three fields are required, so a partial request never clears a field silently (ADR-8).
  if (!EDITABLE_FIELDS.every((field) => field in parsed.body)) {
    sendError(res, 400, 'MISSING_FIELDS', 'יש לשלוח כותרת, תיאור ותאריך יעד.');
    return;
  }
  const { title, description, dueDate } = parsed.body;
  try {
    const result = await updateTaskDetails(id, { title, description, dueDate }, todayInZone());
    if (result.ok) {
      sendJson(res, 200, result.task);
      return;
    }
    const [first] = result.errors;
    sendError(res, 422, first.code, first.message, first.field === 'form' ? undefined : first.field);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      sendNotFound(res);
    } else if (isDbInputError(err)) {
      sendError(res, 422, 'VALIDATION_ERROR', 'הנתונים שנשלחו אינם תקינים.');
    } else {
      sendServerError(res, err);
    }
  }
}

async function handleDelete(id: string, res: VercelResponse): Promise<void> {
  try {
    await deleteTask(id);
    sendNoContent(res);
  } catch (err) {
    if (err instanceof TaskNotFoundError) {
      sendNotFound(res);
    } else {
      sendServerError(res, err);
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    methodNotAllowed(res, ['PATCH', 'DELETE']);
    return;
  }
  const id = req.query?.id;
  if (!isUuid(id)) {
    sendError(res, 400, 'INVALID_ID', 'מזהה המשימה אינו תקין.');
    return;
  }
  if (req.method === 'PATCH') {
    await handleUpdate(id, req, res);
  } else {
    await handleDelete(id, res);
  }
}
