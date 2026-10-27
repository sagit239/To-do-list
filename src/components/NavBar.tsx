import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'nav__link nav__link--active' : 'nav__link';

export function NavBar() {
  return (
    <header className="nav-bar">
      <nav className="nav" aria-label="ניווט ראשי">
        <NavLink to="/" end className={linkClass}>
          דף הבית
        </NavLink>
        <NavLink to="/about" className={linkClass}>
          אודות
        </NavLink>
      </nav>
    </header>
  );
}
