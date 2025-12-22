import { type ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
    children: ReactNode;
    className?: string;
    hover?: boolean;
}

export function Card({ children, className, hover = false }: CardProps) {
    return (
        <div
            className={clsx(
                'rounded-xl shadow-sm transition-colors',
                hover && 'hover:shadow-md transition-all cursor-pointer',
                className
            )}
            style={{
                backgroundColor: 'var(--theme-card)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--theme-border)',
            }}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={clsx('px-6 py-4', className)}
            style={{ borderBottom: '1px solid var(--theme-border)' }}
        >
            {children}
        </div>
    );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={clsx('px-6 py-4', className)}>
            {children}
        </div>
    );
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <h3 className={clsx('text-lg font-semibold', className)}>
            {children}
        </h3>
    );
}
