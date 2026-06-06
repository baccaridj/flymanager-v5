/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        petroleum: "#1F3A3D",
        wood: "#6E5841",
        sage: "#8C9B8A",
        olive: "#5A6842",
        ivory: "#F5F3EB",
        night: "#0B1517"
      },
      fontFamily: {
        display: ['"Noto Serif Display"', "Georgia", "serif"],
        sans: ["Sora", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        premium: "0 28px 90px rgba(0,0,0,.34)"
      }
    },
  },
  plugins: [],
};
