/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./dashboard.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            colors: {
                "primary": "#135bec",
                "primary-hover": "#0f4bc4",
                "background-light": "#f6f6f8",
                "background-dark": "#101622",
                "surface-light": "#ffffff",
                "surface-dark": "#1e293b",
            },
            fontFamily: {
                "display": ["Space Grotesk", "sans-serif"],
                "body": ["Space Grotesk", "sans-serif"]
            },
        },
    },
    plugins: [],
}
