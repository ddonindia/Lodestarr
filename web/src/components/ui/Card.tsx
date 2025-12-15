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
                'bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm',
                hover && 'hover:shadow-md hover:border-neutral-300 dark:hover:border-neutral-600 transition-all cursor-pointer',
                className
            )}
        >
            {children}
        </div>
    );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={clsx('px-6 py-4 border-b border-neutral-200 dark:border-neutral-700', className)}>
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
        <h3 className={clsx('text-lg font-semibold text-neutral-900 dark:text-white', className)}>
            {children}
        </h3>
    );
}
