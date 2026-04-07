import React from "react";

interface FoundingBadgeProps {
    /** "pill" = compact inline badge, "icon" = small square/circle badge for tight spaces */
    variant?: "pill" | "icon";
    theme?: "dark" | "light";
    className?: string;
}

/**
 * Founding Member badge — shown on founder profiles and shareable score cards.
 * Gold gradient with a subtle shimmer animation.
 */
const FoundingBadge: React.FC<FoundingBadgeProps> = ({
    variant = "pill",
    theme = "dark",
    className = "",
}) => {
    const isDark = theme === "dark";

    if (variant === "icon") {
        return (
            <span
                title="Founding Member"
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 ${className}`}
                style={{
                    background: "linear-gradient(135deg, #f5c842 0%, #e09b1a 50%, #f7d76a 100%)",
                    boxShadow: "0 0 8px rgba(240,185,11,0.5)",
                }}
            >
                {/* Crown icon via inline SVG */}
                <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M3 17L6 8L10.5 13L12 6L13.5 13L18 8L21 17H3Z"
                        fill="rgba(0,0,0,0.7)"
                        stroke="none"
                    />
                    <rect x="3" y="18" width="18" height="2" rx="1" fill="rgba(0,0,0,0.7)" />
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
                    ? "linear-gradient(135deg, rgba(245,200,66,0.15) 0%, rgba(224,155,26,0.1) 100%)"
                    : "linear-gradient(135deg, rgba(245,200,66,0.25) 0%, rgba(224,155,26,0.15) 100%)",
                border: "1px solid rgba(240,185,11,0.45)",
                color: isDark ? "#f5c842" : "#9a6c00",
                boxShadow: isDark ? "0 0 12px rgba(240,185,11,0.15)" : "none",
            }}
        >
            {/* Crown SVG */}
            <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
            >
                <path
                    d="M3 17L6 8L10.5 13L12 6L13.5 13L18 8L21 17H3Z"
                    fill={isDark ? "#f5c842" : "#9a6c00"}
                />
                <rect x="3" y="18" width="18" height="2" rx="1" fill={isDark ? "#f5c842" : "#9a6c00"} />
            </svg>
            Founding Member
        </span>
    );
};

export default FoundingBadge;
