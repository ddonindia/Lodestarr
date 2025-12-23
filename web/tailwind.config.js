/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: 'var(--theme-accent)',
                    50: 'var(--theme-accent)',
                    100: 'var(--theme-accent)',
                    200: 'var(--theme-accent)',
                    300: 'var(--theme-accent)',
                    400: 'var(--theme-accent)',
                    500: 'var(--theme-accent)',
                    600: 'var(--theme-accent)',
                    700: 'var(--theme-accent)',
                    800: 'var(--theme-accent)',
                    900: 'var(--theme-accent)',
                },
                // Add gray mapping if needed for text-neutral vs theme-text
            },
            animation: {
                'fade-in': 'fadeIn 0.2s ease-in',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { transform: 'translateY(10px)', opacity: '0' },
                    '100%': { transform: 'translateY(0)', opacity: '1' },
                },
            },
        },
    },
    plugins: [],
}

