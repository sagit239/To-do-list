import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';
import { OfflineNotice } from './OfflineNotice';

export function Layout() {
  return (
    <div className="app">
      <NavBar />
      <OfflineNotice />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
