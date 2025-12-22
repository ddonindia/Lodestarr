import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', loading, children, className, disabled, style, ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

        const sizes = {
            sm: 'text-sm px-3 py-1.5',
            md: 'text-sm px-4 py-2',
            lg: 'text-base px-6 py-3',
        };

        // Build variant styles with CSS variables for accent colors
        const getVariantStyles = (): CSSProperties => {
            switch (variant) {
                case 'primary':
                    return {
                        backgroundColor: 'var(--theme-accent)',
                        color: 'white',
                    };
                case 'secondary':
                    return {
                        backgroundColor: 'var(--theme-border)',
                        color: 'inherit',
                    };
                case 'danger':
                    return {
                        backgroundColor: '#dc2626',
                        color: 'white',
                    };
                case 'ghost':
                    return {
                        backgroundColor: 'transparent',
                        color: 'inherit',
                    };
                default:
                    return {};
            }
        };

        return (
            <button
                ref={ref}
                className={clsx(baseStyles, sizes[size], className)}
                disabled={disabled || loading}
                style={{ ...getVariantStyles(), ...style }}
                {...props}
            >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {children}
            </button>
        );
    }
);

Button.displayName = 'Button';
