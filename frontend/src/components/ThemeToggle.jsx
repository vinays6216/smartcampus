import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { currentTheme, toggleTheme } from '../utils/theme';

export default function ThemeToggle({ className = 'btn-icon' }) {
  const [theme, setTheme] = useState(currentTheme());
  const dark = theme === 'dark';
  return (
    <button type="button" className={`${className} theme-toggle`} onClick={() => setTheme(toggleTheme())}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
