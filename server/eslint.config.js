import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';

export default tseslint.config([
    globalIgnores(['dist', 'node_modules', 'coverage']),
    {
        files: ['**/*.ts'],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
        ],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.node, // Set to node for the backend
        },
        
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    "argsIgnorePattern": "^_",
                    "varsIgnorePattern": "^_",
                    "caughtErrorsIgnorePattern": "^_"
                }
            ]
        } 
    },
])
