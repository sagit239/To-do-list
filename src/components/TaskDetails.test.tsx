import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../shared/types';
import { localToday } from '../../shared/validation';
import { TaskDetails } from './TaskDetails';

const task: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'לתכנן חופשה',
  description: 'לבדוק מחירים',
  dueDate: '2030-04-28',
  completed: false,
  position: 0,
};

// A saved due date that has already passed.
const overdue: Task = { ...task, dueDate: '2020-01-01' };

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderDetails(current: Task | null = task) {
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  render(<TaskDetails task={current} onSaved={onSaved} onDeleted={onDeleted} />);
  return { onSaved, onDeleted };
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string);
}

afterEach(() => vi.unstubAllGlobals());

describe('TaskDetails', () => {
  it('shows the selection message when no task is selected', () => {
    renderDetails(null);
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'שמור שינויים' })).toBeNull();
  });

  it('shows the task in editable fields, with a date field without time', () => {
    renderDetails();
    expect(screen.getByLabelText('כותרת')).toHaveValue('לתכנן חופשה');
    expect(screen.getByLabelText('תיאור')).toHaveValue('לבדוק מחירים');
    expect(screen.getByLabelText('תאריך יעד')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('תאריך יעד')).toHaveValue('2030-04-28');
    expect(screen.getByLabelText('כותרת')).not.toHaveAttribute('readonly');
  });

  it('saves all three fields with PATCH and reports the updated task', async () => {
    const updated = { ...task, title: 'חופשה בצפון', dueDate: null };
    const fetchMock = vi.fn(() => jsonResponse(updated));
    vi.stubGlobal('fetch', fetchMock);
    const { onSaved } = renderDetails();
    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: '  חופשה בצפון ' } });
    fireEvent.change(screen.getByLabelText('תאריך יעד'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/tasks/${task.id}`);
    expect(init.method).toBe('PATCH');
    expect(sentBody(fetchMock)).toEqual({ title: 'חופשה בצפון', description: 'לבדוק מחירים', dueDate: null });
    expect(screen.getByRole('status')).toHaveTextContent('השינויים נשמרו');
    expect(screen.getByLabelText('כותרת')).toHaveValue('חופשה בצפון');
  });

  it('blocks empty, too-long and past-date input next to the fields, keeping the text', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderDetails();
    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: '  ' } });
    fireEvent.change(screen.getByLabelText('תיאור'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.getByRole('alert')).toHaveTextContent('יש להזין כותרת או תיאור למשימה');
    expect(screen.getByLabelText('כותרת')).toHaveValue('  ');

    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'א'.repeat(101) } });
    fireEvent.change(screen.getByLabelText('תיאור'), { target: { value: 'ב'.repeat(2001) } });
    fireEvent.change(screen.getByLabelText('תאריך יעד'), { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.getByText('הכותרת ארוכה מדי (עד 100 תווים)')).toBeInTheDocument();
    expect(screen.getByText('התיאור ארוך מדי (עד 2,000 תווים)')).toBeInTheDocument();
    expect(screen.getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
    expect(screen.getByLabelText('תאריך יעד')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows saving a task whose saved due date has passed, if the date is unchanged', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ...overdue, title: 'עודכן' }));
    vi.stubGlobal('fetch', fetchMock);
    const { onSaved } = renderDetails(overdue);
    expect(screen.getByLabelText('תאריך יעד')).not.toHaveAttribute('min');
    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'עודכן' } });
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sentBody(fetchMock).dueDate).toBe('2020-01-01');
  });

  it('blocks changing a passed due date to another past date', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderDetails(overdue);
    fireEvent.change(screen.getByLabelText('תאריך יעד'), { target: { value: '2020-01-02' } });
    expect(screen.getByLabelText('תאריך יעד')).toHaveAttribute('min', localToday());
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the edited values and shows the error when saving fails, then retries', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }, 503),
      )
      .mockImplementationOnce(() => jsonResponse({ ...task, title: 'חדש' }));
    vi.stubGlobal('fetch', fetchMock);
    const { onSaved } = renderDetails();
    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'חדש' } });
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('השירות אינו זמין כרגע.');
    expect(screen.getByLabelText('כותרת')).toHaveValue('חדש');
    expect(onSaved).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('shows a clear message when the task was deleted by someone else (404)', async () => {
    vi.stubGlobal('fetch', () =>
      jsonResponse(
        { error: { code: 'TASK_NOT_FOUND', message: 'המשימה לא נמצאה. ייתכן שנמחקה בידי מבקר אחר – רעננו את הדף.' } },
        404,
      ),
    );
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('המשימה לא נמצאה');
    expect(screen.getByLabelText('כותרת')).toHaveValue('לתכנן חופשה');
  });

  it('shows a server field error next to that field', async () => {
    vi.stubGlobal('fetch', () =>
      jsonResponse({ error: { code: 'DATE_IN_PAST', message: 'תאריך היעד לא יכול להיות בעבר', field: 'dueDate' } }, 422),
    );
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(await screen.findByText('תאריך היעד לא יכול להיות בעבר')).toHaveAttribute('id', 'details-dueDate-error');
  });

  it('a status or position update of the same task keeps the unsaved draft', () => {
    const { rerender } = render(<TaskDetails task={task} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('תיאור'), { target: { value: 'טיוטה' } });
    rerender(<TaskDetails task={{ ...task, completed: true, position: 3 }} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByLabelText('תיאור')).toHaveValue('טיוטה');
  });

  describe('delete', () => {
    it('opens a confirmation; cancel and Escape close it without a request', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const { onDeleted } = renderDetails();
      await userEvent.click(screen.getByRole('button', { name: 'מחק משימה' }));
      const dialog = screen.getByRole('dialog', { name: 'מחיקת משימה' });
      expect(dialog).toHaveTextContent('האם אתה בטוח שברצונך למחוק את המשימה הזו?');
      expect(within(dialog).getByRole('button', { name: 'ביטול' })).toHaveFocus();

      await userEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'מחק משימה' }));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('confirming deletes on the server, then reports it', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
      vi.stubGlobal('fetch', fetchMock);
      const { onDeleted } = renderDetails();
      await userEvent.click(screen.getByRole('button', { name: 'מחק משימה' }));
      await userEvent.click(screen.getByRole('button', { name: 'אישור' }));
      await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(task.id));
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`/api/tasks/${task.id}`);
      expect(init.method).toBe('DELETE');
    });

    it('a failed delete keeps the dialog open with the error and reports nothing', async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
      const { onDeleted } = renderDetails();
      await userEvent.click(screen.getByRole('button', { name: 'מחק משימה' }));
      await userEvent.click(screen.getByRole('button', { name: 'אישור' }));
      const dialog = screen.getByRole('dialog', { name: 'מחיקת משימה' });
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('אין חיבור לשרת');
      expect(within(dialog).getByRole('button', { name: 'אישור' })).toBeEnabled();
      expect(onDeleted).not.toHaveBeenCalled();
    });

    it('opening and cancelling the confirmation keeps the unsaved draft', async () => {
      vi.stubGlobal('fetch', vi.fn());
      renderDetails();
      fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'טיוטה' } });
      await userEvent.click(screen.getByRole('button', { name: 'מחק משימה' }));
      await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
      expect(screen.getByLabelText('כותרת')).toHaveValue('טיוטה');
    });
  });
});
