import type { ComponentPropsWithoutRef } from 'react';

const brandAssetPath = {
  dark: '/logo/open-industrial-design-logo-dark.png',
  light: '/logo/open-industrial-design-logo-primary.png',
  icon: '/icon/open-industrial-design-icon-64.png',
} as const;

export function BrandLogo({
  variant,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<'img'>, 'alt' | 'src'> & {
  variant: keyof typeof brandAssetPath;
}) {
  return (
    <img
      {...props}
      alt="Open Industrial Design"
      className={className}
      src={brandAssetPath[variant]}
    />
  );
}
