import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))));
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('navigation', () => {
  it('opens /about directly with the about link active', () => {
    renderAt('/about');
    expect(screen.getByRole('heading', { level: 1, name: 'אודות' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'אודות' })).toHaveAttribute('aria-current', 'page');
  });

  it('moves between home and about', async () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'המשימות שלי' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'אודות' }));
    expect(screen.getByRole('heading', { level: 1, name: 'אודות' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'דף הבית' }));
    expect(screen.getByRole('heading', { level: 1, name: 'המשימות שלי' })).toBeInTheDocument();
  });
});
