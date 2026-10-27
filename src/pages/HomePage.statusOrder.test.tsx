import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '../../shared/types';
import { HomePage } from './HomePage';

const tasks: Task[] = [
  { id: '1', title: 'לקנות מצרכים', description: 'חלב ולחם', dueDate: null, completed: false, position: 0 },
  { id: '2', title: 'לסיים דוח', description: null, dueDate: null, completed: true, position: 1 },
  { id: '3', title: null, description: 'לבדוק ביטוח לרכב', dueDate: null, completed: false, position: 2 },
];

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

const apiError = (status: number, code: string, message: string) => jsonResponse({ error: { code, message } }, status);

/** GET returns `list`; writes go to `write` (default: success). */
function mockApi(write: Handler = (url) => jsonResponse(url.endsWith('/order') ? tasks : tasks[0]), list = tasks) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    !init?.method || init.method === 'GET' ? jsonResponse(list) : write(url, init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const writes = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const rowTexts = () => screen.getAllByRole('listitem').map((row) => row.querySelector('.task-row__text')!.textContent);

/** jsdom has no layout: give each row a 50px-high box so dnd-kit's keyboard sensor can move between rows. */
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const row = this.closest('li');
    const index = row ? Array.from(row.parentElement!.children).indexOf(row) : 0;
    const top = index * 50;
    return { x: 0, y: top, top, left: 0, right: 300, bottom: top + 50, width: 300, height: 50, toJSON: () => ({}) };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function keyboardDrag(handleName: RegExp, steps: number) {
  const handle = screen.getByRole('button', { name: handleName });
  act(() => handle.focus());
  await userEvent.keyboard(' ');
  for (let i = 0; i < steps; i++) await userEvent.keyboard('{ArrowDown}');
  await userEvent.keyboard(' ');
}

describe('HomePage – completion status', () => {
  it('checking saves the explicit value immediately and keeps the task in place', async () => {
    const fetchMock = mockApi();
    renderHome();
    const checkbox = await screen.findByRole('checkbox', { name: /לקנות מצרכים/ });
    await userEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('task-row--completed');
    const [call] = writes(fetchMock, 'PATCH');
    expect(call[0]).toBe('/api/tasks/1/status');
    expect(JSON.parse(call[1]!.body as string)).toEqual({ completed: true });
    expect(rowTexts()).toEqual(['לקנות מצרכים', 'לסיים דוח', 'לבדוק ביטוח לרכב']);
  });

  it('unchecking a completed task sends completed: false', async () => {
    const fetchMock = mockApi();
    renderHome();
    await userEvent.click(await screen.findByRole('checkbox', { name: /לסיים דוח/ }));
    expect(screen.getByRole('checkbox', { name: /לסיים דוח/ })).not.toBeChecked();
    expect(JSON.parse(writes(fetchMock, 'PATCH')[0][1]!.body as string)).toEqual({ completed: false });
  });

  it('clicking the checkbox does not select the task', async () => {
    mockApi();
    renderHome();
    await userEvent.click(await screen.findByRole('checkbox', { name: /לקנות מצרכים/ }));
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
  });

  it('disables the checkbox while its request is pending', async () => {
    let resolve!: (r: Response) => void;
    mockApi(() => new Promise((r) => (resolve = r)));
    renderHome();
    const checkbox = await screen.findByRole('checkbox', { name: /לקנות מצרכים/ });
    await userEvent.click(checkbox);
    expect(checkbox).toBeDisabled();
    await act(async () => resolve(new Response(JSON.stringify(tasks[0]), { status: 200 })));
    expect(checkbox).toBeEnabled();
  });

  it('a failed save rolls back only that checkbox and shows a message', async () => {
    mockApi(() => apiError(503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין כרגע. נסו שוב בעוד רגע.'));
    renderHome();
    const checkbox = await screen.findByRole('checkbox', { name: /לקנות מצרכים/ });
    await userEvent.click(checkbox);
    expect(await screen.findByRole('alert')).toHaveTextContent('השירות אינו זמין כרגע');
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /לסיים דוח/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'רענן את הרשימה' })).not.toBeInTheDocument();
  });

  it('a network failure shows the default message', async () => {
    mockApi(() => Promise.reject(new TypeError('Failed to fetch')));
    renderHome();
    await userEvent.click(await screen.findByRole('checkbox', { name: /לקנות מצרכים/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אין חיבור לשרת');
  });

  it('checking the selected task keeps the unsaved draft and sends no details save', async () => {
    const fetchMock = mockApi();
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'לקנות מצרכים' }));
    await userEvent.type(screen.getByLabelText('תיאור'), ' וגבינה');
    await userEvent.click(screen.getByRole('checkbox', { name: /לקנות מצרכים/ }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: /לקנות מצרכים/ })).toBeEnabled());
    expect(screen.getByLabelText('תיאור')).toHaveValue('חלב ולחם וגבינה');
    expect(writes(fetchMock, 'PATCH').map(([url]) => url)).toEqual(['/api/tasks/1/status']);
  });
});

describe('HomePage – manual order', () => {
  it('dragging shows the new order at once and sends the full id list', async () => {
    const fetchMock = mockApi();
    renderHome();
    await screen.findAllByRole('listitem');
    await keyboardDrag(/גרירה לשינוי מיקום: לקנות מצרכים/, 2);

    await waitFor(() => expect(rowTexts()).toEqual(['לסיים דוח', 'לבדוק ביטוח לרכב', 'לקנות מצרכים']));
    const [call] = writes(fetchMock, 'PUT');
    expect(call[0]).toBe('/api/tasks/order');
    expect(JSON.parse(call[1]!.body as string)).toEqual({ orderedIds: ['2', '3', '1'] });
  });

  it('a completed task can be dragged like the others', async () => {
    const fetchMock = mockApi();
    renderHome();
    await screen.findAllByRole('listitem');
    await keyboardDrag(/גרירה לשינוי מיקום: לסיים דוח/, 1);
    await waitFor(() => expect(rowTexts()).toEqual(['לקנות מצרכים', 'לבדוק ביטוח לרכב', 'לסיים דוח']));
    expect(JSON.parse(writes(fetchMock, 'PUT')[0][1]!.body as string)).toEqual({ orderedIds: ['1', '3', '2'] });
  });

  it('dropping in the same place sends nothing', async () => {
    const fetchMock = mockApi();
    renderHome();
    await screen.findAllByRole('listitem');
    await keyboardDrag(/גרירה לשינוי מיקום: לקנות מצרכים/, 0);
    expect(writes(fetchMock, 'PUT')).toHaveLength(0);
  });

  it('pressing the handle does not select the task or change its status', async () => {
    const fetchMock = mockApi();
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: /גרירה לשינוי מיקום: לקנות מצרכים/ }));
    expect(screen.getByText('בחר משימה מהרשימה כדי לצפות בפרטיה')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /לקנות מצרכים/ })).not.toBeChecked();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed save restores the previous order and shows a message', async () => {
    mockApi(() => apiError(503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין כרגע. נסו שוב בעוד רגע.'));
    renderHome();
    await screen.findAllByRole('listitem');
    await keyboardDrag(/גרירה לשינוי מיקום: לקנות מצרכים/, 2);

    expect(await screen.findByRole('alert')).toHaveTextContent('השירות אינו זמין כרגע');
    expect(rowTexts()).toEqual(['לקנות מצרכים', 'לסיים דוח', 'לבדוק ביטוח לרכב']);
  });

  it('dragging the selected task keeps the unsaved draft', async () => {
    mockApi();
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'לקנות מצרכים' }));
    await userEvent.type(screen.getByLabelText('כותרת'), ' וירקות');
    await keyboardDrag(/גרירה לשינוי מיקום: לקנות מצרכים/, 1);

    await waitFor(() => expect(rowTexts()[1]).toBe('לקנות מצרכים'));
    expect(screen.getByLabelText('כותרת')).toHaveValue('לקנות מצרכים וירקות');
  });

  it('a 409 restores the order and offers a refresh that reloads from the server', async () => {
    const fresh: Task[] = [tasks[2], { ...tasks[0], position: 1 }];
    let getCount = 0;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return apiError(409, 'ORDER_CONFLICT', 'רשימת המשימות השתנתה בינתיים. רעננו את הרשימה ונסו שוב.');
      }
      getCount += 1;
      return jsonResponse(getCount === 1 ? tasks : fresh);
    });
    vi.stubGlobal('fetch', fetchMock);
    renderHome();
    await userEvent.click(await screen.findByRole('button', { name: 'לקנות מצרכים' }));
    await userEvent.type(screen.getByLabelText('כותרת'), '!');
    await keyboardDrag(/גרירה לשינוי מיקום: לסיים דוח/, 1);

    expect(await screen.findByRole('alert')).toHaveTextContent('רשימת המשימות השתנתה בינתיים');
    expect(rowTexts()).toEqual(['לקנות מצרכים', 'לסיים דוח', 'לבדוק ביטוח לרכב']);

    await userEvent.click(screen.getByRole('button', { name: 'רענן את הרשימה' }));
    await waitFor(() => expect(rowTexts()).toEqual(['לבדוק ביטוח לרכב', 'לקנות מצרכים']));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The selected task still exists, so its draft survives the refresh.
    expect(screen.getByLabelText('כותרת')).toHaveValue('לקנות מצרכים!');
  });

  it('does not fetch in the background', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = mockApi();
      renderHome();
      await screen.findAllByRole('listitem');
      await act(async () => vi.advanceTimersByTime(60_000));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
