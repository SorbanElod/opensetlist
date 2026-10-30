import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../theme/ThemeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;
  const label =
    theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-raised hover:text-text"
    >
      <Icon size={16} />
    </button>
  );
}
