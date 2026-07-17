import type { ButtonProps } from 'antd';
import { Button, ConfigProvider } from 'antd';

/**
 * Primary action button themed with the same purple accent used for the Studio nav tab
 * (#722ed1), so Studio's primary CTAs ("Neue Diskussion" / "New Discussion") visually tie
 * back to the Studio brand color. Uses ConfigProvider (not an inline style override) so
 * antd derives correct hover/active/focus-ring shades from the purple token instead of a
 * flat color with no interaction feedback.
 */
export function StudioPrimaryButton(props: ButtonProps) {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#722ed1' } }}>
      <Button type="primary" {...props} />
    </ConfigProvider>
  );
}
