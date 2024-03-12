module.exports = {
    env: {
        browser: false,
        es2021: true,
        node: true,
    },
    extends: ['prettier', 'eslint:recommended'],
    overrides: [
        {
            env: {
                node: true,
            },
            files: ['.eslintrc.{js,cjs}'],
            parserOptions: {
                sourceType: 'script',
            },
        },
    ],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: module,
    },
    rules: {},
}
