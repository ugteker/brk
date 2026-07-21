import type { ButtonProps } from 'antd';
import { Button, ConfigProvider } from 'antd';

/**
 * "Wird zusammengefasst" / listening-active button. The app's default colorPrimary token
 * (set in main.tsx) is already '#1677ff', so a plain `type="primary"` button matches this
 * color exactly - no inline style override needed, which also means antd derives correct
 * hover/active/focus-ring shades automatically (unlike a flat inline `style` override).
 */
export function ListenActiveButton(props: ButtonProps) {
  return <Button type="primary" {...props} />;
}

/**
 * "Fasse zusammen" / listen-idle button. Uses a soft light-blue tint that isn't one of
 * antd's built-in button types, so it's implemented via a scoped ConfigProvider Button
 * component-token override (defaultBg/defaultColor/defaultHoverBg/etc.) rather than a
 * flat inline `style` override, so hover/active states are still visually distinct.
 */
export function ListenIdleButton(props: ButtonProps) {
  return (
    <ConfigProvider
      theme={{
        components: {
          Button: {
            defaultBg: '#e6f4ff',
            defaultColor: '#1677ff',
            defaultBorderColor: '#91caff',
            defaultHoverBg: '#bae0ff',
            defaultHoverColor: '#0958d9',
            defaultHoverBorderColor: '#69b1ff',
            defaultActiveBg: '#91caff',
            defaultActiveColor: '#0958d9',
            defaultActiveBorderColor: '#69b1ff'
          }
        }
      }}
    >
      <Button style={{ fontWeight: 600 }} {...props} />
    </ConfigProvider>
  );
}
