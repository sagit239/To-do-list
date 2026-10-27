import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '../../shared/types';
import { HomePage } from './HomePage';

const tasks: Task[] = [
  { id: '1', title: 'לקנות מצרכים', description: 'חלב ולחם', dueDate: '2026-11-01', completed: false, position: 0 },
  { id: '2', title: 'לסיים דוח', description: null, dueDate: null, completed: true, position: 1 },
  { id: '3', title: null, description: 'לבדוק ביטוח לרכב', dueDate: null, completed: false, position: 2 },
];

function mockFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('HomePage', () => {
  it('shows a loading state while tasks are being fetched', () => {
    mockFetch(() => new Promise(() => {}));
    renderHome();
    expect(screen.getByRole('status')).toHaveTextContent('טוען משימות');
  });

  it('shows tasks in order, with no task selected on entry', async () => {
    mockFetch(() => jsonResponse(tasks));
    renderHome();
    const rows = await screen.findAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'לקנות מצרכים',
      'לסיים דוח (הושלמה)',
      'לבדוק ביטוח לרכב',
    ]);
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
    expect(screen.queryByLabelText('כותרת')).not.toBeInTheDocument();
  });

  it('marks completed tasks visually', async () => {
    mockFetch(() => jsonResponse(tasks));
    renderHome();
    const rows = await screen.findAllByRole('listitem');
    expect(rows[1]).toHaveClass('task-row--completed');
    expect(rows[0]).not.toHaveClass('task-row--completed');
  });

  it('shows the selected task details', async () => {
    mockFetch(() => jsonResponse(tasks));
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'לקנות מצרכים' }));
    expect(screen.getByLabelText('כותרת')).toHaveValue('לקנות מצרכים');
    expect(screen.getByLabelText('תיאור')).toHaveValue('חלב ולחם');
    expect(screen.getByLabelText('תאריך יעד')).toHaveValue('2026-11-01');
    expect(screen.getByRole('button', { name: 'לקנות מצרכים' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).not.toBeInTheDocument();
  });

  it('does not show edit or delete actions yet', async () => {
    mockFetch(() => jsonResponse(tasks));
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'לקנות מצרכים' }));
    expect(screen.queryByRole('button', { name: /שמור שינויים|מחק משימה/ })).toBeNull();
    expect(screen.getByLabelText('כותרת')).toHaveAttribute('readonly');
  });

  it('creates a task: closes the modal, appends it and selects it', async () => {
    const created: Task = {
      id: 'new', title: 'משימה חדשה', description: 'פרטים', dueDate: null, completed: false, position: 3,
    };
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? jsonResponse(created, 201) : jsonResponse(tasks),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'הוסף משימה' }));
    const dialog = screen.getByRole('dialog', { name: 'הוספת משימה' });
    await userEvent.type(within(dialog).getByLabelText('כותרת'), 'משימה חדשה');
    await userEvent.click(within(dialog).getByRole('button', { name: 'הוסף משימה' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[3]).toHaveTextContent('משימה חדשה');
    expect(rows[3]).toHaveClass('task-row--selected');
    expect(screen.getByLabelText('כותרת')).toHaveValue('משימה חדשה');
    expect(screen.getByLabelText('תיאור')).toHaveValue('פרטים');
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('closing without saving discards the draft; reopening starts empty', async () => {
    mockFetch(() => jsonResponse(tasks));
    renderHome();
    const addButton = await screen.findByRole('button', { name: 'הוסף משימה' });
    await userEvent.click(addButton);
    await userEvent.type(screen.getByLabelText('כותרת'), 'טיוטה');
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'סגור' })[1]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addButton).toHaveFocus();

    await userEvent.click(addButton);
    expect(screen.getByLabelText('כותרת')).toHaveValue('');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('disables adding with a notice when the list has 1,000 tasks', async () => {
    const full: Task[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `t${i}`, title: `משימה ${i}`, description: null, dueDate: null, completed: false, position: i,
    }));
    mockFetch(() => jsonResponse(full));
    renderHome();
    expect(await screen.findByText('הרשימה מלאה (1,000 משימות)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
  });

  it('keeps adding disabled while loading and after a load error', async () => {
    mockFetch(() => new Promise(() => {}));
    const { unmount } = renderHome();
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
    unmount();

    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    renderHome();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
  });

  it('enables adding when the list is ready, also when empty', async () => {
    mockFetch(() => jsonResponse([]));
    renderHome();
    await screen.findByText('אין משימות ברשימה');
    expect(screen.getByRole('button', { name: 'הוסף משימה' })).toBeEnabled();
    expect(screen.queryByText('הרשימה מלאה (1,000 משימות)')).not.toBeInTheDocument();
  });

  it('shows an empty state for an empty list', async () => {
    mockFetch(() => jsonResponse([]));
    renderHome();
    expect(await screen.findByText('אין משימות ברשימה')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a server error, not an empty list', async () => {
    mockFetch(() =>
      jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }, 503),
    );
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('השירות אינו זמין כרגע.');
    expect(screen.queryByText('אין משימות ברשימה')).not.toBeInTheDocument();
  });

  it('shows a network error, not an empty list', async () => {
    mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת');
    expect(screen.queryByText('אין משימות ברשימה')).not.toBeInTheDocument();
  });

  it('requests fresh data without the HTTP cache', async () => {
    mockFetch(() => jsonResponse([]));
    renderHome();
    await screen.findByText('אין משימות ברשימה');
    expect(fetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({ cache: 'no-store' }));
  });
});
