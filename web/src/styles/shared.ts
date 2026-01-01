import type { CSSProperties } from 'react';

/**
 * Shared input style using CSS variables
 */
export const inputStyle: CSSProperties = {
    backgroundColor: 'var(--theme-card)',
    border: '1px solid var(--theme-border)',
    color: 'inherit',
};

/**
 * Primary button style using accent color
 */
export const buttonPrimaryStyle: CSSProperties = {
    backgroundColor: 'var(--theme-accent)',
    color: 'white',
};

/**
 * Secondary button style with themed background
 */
export const buttonSecondaryStyle: CSSProperties = {
    backgroundColor: 'var(--theme-card)',
    border: '1px solid var(--theme-border)',
    color: 'inherit',
};
