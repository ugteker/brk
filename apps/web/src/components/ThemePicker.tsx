import { Button } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useTheme } from '../theme/ThemeContext';
import { TouchSafeTooltip } from './TouchSafeTooltip';

export function ThemePicker() {
  const { theme, toggleTheme } = useTheme();

  return (
    <TouchSafeTooltip title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
      <Button
        aria-label="Theme picker"
        shape="circle"
        icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
        onClick={toggleTheme}
      />
    </TouchSafeTooltip>
  );
}
