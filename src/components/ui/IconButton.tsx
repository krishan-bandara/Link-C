import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

type Common = {
  /** Required accessible name (icon-only buttons have no visible text). */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'plain' | 'solid' | 'grad';
  className?: string;
  children: ReactNode;
};

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children' | 'aria-label'> & { href?: undefined };
type AsLink = Common & { href: string; onClick?: () => void };

/** Round icon-only button. Pass `href` to render a link instead. */
export default function IconButton(props: AsButton | AsLink) {
  const { label, size = 'md', variant = 'plain', className = '', children } = props;
  const cls = `ui-icon-btn ${size === 'sm' ? 'ui-icon-btn-sm' : size === 'lg' ? 'ui-icon-btn-lg' : ''} ${
    variant === 'solid' ? 'ui-icon-btn-solid' : variant === 'grad' ? 'ui-icon-btn-grad' : ''
  } ${className}`;
  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={label} title={label} className={cls} onClick={props.onClick}>
        {children}
      </Link>
    );
  }
  const { label: _l, size: _s, variant: _v, className: _c, children: _ch, href: _h, ...rest } = props;
  void [_l, _s, _v, _c, _ch, _h];
  return (
    <button type="button" aria-label={label} title={label} className={cls} {...rest}>
      {children}
    </button>
  );
}
