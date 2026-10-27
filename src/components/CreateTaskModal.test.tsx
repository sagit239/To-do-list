import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '../../shared/types';
import { localToday } from '../../shared/validation';
import { CreateTaskModal } from './CreateTaskModal';

const created: Task = { id: 'n1', title: 'חדשה', description: null, dueDate: null, completed: false, position: 0 };

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderModal() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<CreateTaskModal onClose={onClose} onCreated={onCreated} />);
  return { onClose, onCreated };
}

afterEach(() => vi.unstubAllGlobals());

describe('CreateTaskModal', () => {
  it('opens with empty text fields, placeholders and today as the due date', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'הוספת משימה' })).toBeInTheDocument();
    expect(screen.getByLabelText('כותרת')).toHaveValue('');
    expect(screen.getByLabelText('כותרת')).toHaveAttribute('placeholder', 'הזן כותרת (לא חובה)');
    expect(screen.getByLabelText('תיאור')).toHaveValue('');
    expect(screen.getByLabelText('תיאור')).toHaveAttribute('placeholder', 'הזן תיאור (לא חובה)');
    const date = screen.getByLabelText('תאריך יעד');
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveValue(localToday());
    expect(date).toHaveAttribute('min', localToday());
    expect(screen.getByLabelText('כותרת')).toHaveFocus();
  });

  it('blocks an empty task with the in-form message and sends no request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { onCreated } = renderModal();
    await userEvent.type(screen.getByLabelText('כותרת'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    expect(screen.getByRole('alert')).toHaveTextContent('יש להזין כותרת או תיאור למשימה');
    expect(screen.getByLabelText('כותרת')).toHaveValue('   ');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('blocks a past due date and a too-long title next to the fields', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderModal();
    fireEvent.change(screen.getByLabelText('כותרת'), { target: { value: 'א'.repeat(101) } });
    fireEvent.change(screen.getByLabelText('תאריך יעד'), { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    expect(screen.getByText('הכותרת ארוכה מדי (עד 100 תווים)')).toBeInTheDocument();
    expect(screen.getByText('תאריך היעד לא יכול להיות בעבר')).toBeInTheDocument();
    expect(screen.getByLabelText('תאריך יעד')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves with a cleared date and reports the created task', async () => {
    const fetchMock = vi.fn(() => jsonResponse(created, 201));
    vi.stubGlobal('fetch', fetchMock);
    const { onCreated } = renderModal();
    await userEvent.type(screen.getByLabelText('תיאור'), 'תיאור בלבד');
    fireEvent.change(screen.getByLabelText('תאריך יעד'), { target: { value: '' } });
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/tasks');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: null, description: 'תיאור בלבד', dueDate: null });
  });

  it('keeps the values and shows the error when the server fails, and allows retrying', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }, 503),
      )
      .mockImplementationOnce(() => jsonResponse(created, 201));
    vi.stubGlobal('fetch', fetchMock);
    const { onCreated, onClose } = renderModal();
    await userEvent.type(screen.getByLabelText('כותרת'), 'חדשה');
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('השירות אינו זמין כרגע.');
    expect(screen.getByLabelText('כותרת')).toHaveValue('חדשה');
    expect(screen.getByLabelText('תאריך יעד')).toHaveValue(localToday());
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
  });

  it('shows the full-list rejection inside the form', async () => {
    vi.stubGlobal('fetch', () =>
      jsonResponse({ error: { code: 'TASK_LIMIT_REACHED', message: 'הרשימה מלאה (1,000 משימות).' } }, 409),
    );
    renderModal();
    await userEvent.type(screen.getByLabelText('כותרת'), 'חדשה');
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('הרשימה מלאה');
    expect(screen.getByLabelText('כותרת')).toHaveValue('חדשה');
  });

  it('shows a network error inside the form', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderModal();
    await userEvent.type(screen.getByLabelText('כותרת'), 'חדשה');
    await userEvent.click(screen.getByRole('button', { name: 'הוסף משימה' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת');
  });

  it('closes with the X button, the close button and Escape', async () => {
    const { onClose } = renderModal();
    const [xButton, closeButton] = screen.getAllByRole('button', { name: 'סגור' });
    expect(xButton).toHaveClass('modal__close');
    await userEvent.click(xButton);
    await userEvent.click(closeButton);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
