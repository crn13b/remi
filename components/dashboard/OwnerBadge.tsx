import React from "react";

interface OwnerBadgeProps {
    /** "pill" = compact inline badge, "icon" = small square/circle badge for tight spaces */
    variant?: "pill" | "icon";
    theme?: "dark" | "light";
    className?: string;
}

/**
 * Owner badge — distinct from the Founding Member badge.
 * Deep indigo/violet gradient to visually separate from the gold founding badge.
 */
const OwnerBadge: React.FC<OwnerBadgeProps> = ({
    variant = "pill",
    theme = "dark",
    className = "",
}) => {
    const isDark = theme === "dark";

    if (variant === "icon") {
        return (
            <span
                title="Owner"
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${className}`}
                style={{
                    background: "linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #a78bfa 100%)",
                    boxShadow: "0 0 8px rgba(99,102,241,0.5)",
                }}
            >
                {/* Shield icon */}
                <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M12 2L3 7V12C3 17.25 6.75 21.5 12 22.5C17.25 21.5 21 17.25 21 12V7L12 2Z"
                        fill="rgba(255,255,255,0.9)"
                        stroke="none"
                    />
                    <path
                        d="M10 12.5L11.5 14L14.5 10.5"
                        stroke="rgba(99,102,241,1)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                    />
                </svg>
            </span>
        );
    }

    // pill variant
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.15em] flex-shrink-0 ${className}`}
            style={{
                background: isDark
                    ? "linear-gradient(135deg, rgba(129,140,248,0.15) 0%, rgba(99,102,241,0.1) 100%)"
                    : "linear-gradient(135deg, rgba(129,140,248,0.25) 0%, rgba(99,102,241,0.15) 100%)",
                border: "1px solid rgba(99,102,241,0.45)",
                color: isDark ? "#a5b4fc" : "#4338ca",
                boxShadow: isDark ? "0 0 12px rgba(99,102,241,0.15)" : "none",
            }}
        >
            {/* Shield SVG */}
            <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
            >
                <path
                    d="M12 2L3 7V12C3 17.25 6.75 21.5 12 22.5C17.25 21.5 21 17.25 21 12V7L12 2Z"
                    fill={isDark ? "#a5b4fc" : "#4338ca"}
                />
                <path
                    d="M10 12.5L11.5 14L14.5 10.5"
                    stroke={isDark ? "#1e1b4b" : "#ffffff"}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
            </svg>
            Owner
        </span>
    );
};

export default OwnerBadge;
