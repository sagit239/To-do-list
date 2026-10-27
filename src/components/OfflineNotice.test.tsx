import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFLINE_MESSAGE, OfflineNotice } from './OfflineNotice';

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  });
}

describe('OfflineNotice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows nothing while online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineNotice />);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the notice when the connection drops and hides it when it returns', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineNotice />);

    setOnline(false);
    expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_MESSAGE);

    setOnline(true);
    expect(screen.queryByText(OFFLINE_MESSAGE)).not.toBeInTheDocument();
  });

  it('shows the notice when the page opens offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineNotice />);
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeInTheDocument();
  });
});
