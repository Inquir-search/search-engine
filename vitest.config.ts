import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist'],
        reporter: ['verbose'],
        // Add Vitest setup file to provide Jest compatibility shim
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'tests/',
                'dist/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/examples/**'
            ]
        }
    },
    resolve: {
        alias: {
            '@': './src'
        }
    }
}); 