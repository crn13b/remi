const fs = require('fs');
const content = fs.readFileSync('App.tsx', 'utf8');

// I am trying to fix the missing ScoreCard from the previous changes and restoring 
// the sections that got wiped out

const patched = content.replace(
    /\{\/\* Scorecard \(persists when complete\) \*\/\}([\s\S]*?)<div className="flex-1 p-8 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-500 no-scrollbar">/,
    `{/* ... (Other views MACRO, ANALYST, WATCHLIST, ALERTS stay same) */}\n\n                        {currentView === ViewType.SEARCH && searchStatus !== 'complete' && (`
).replace(
    /<header className="mb-8 flex justify-between items-start">\s*<div>\s*<\/header>\s*<div className=\{\`rounded-\[2\.5rem\] overflow-x-auto \$\{theme === 'light' \? 'bg-white shadow-md' : baseTileClasses\}\`\}><WatchlistTable assets=\{INITIAL_WATCHLIST\} theme=\{theme\} \/><\/div>\s*<\/div>\s*\)\s*\}/,
    `</div>\n                        )}`
);

fs.writeFileSync('App.tsx.patched', patched);
