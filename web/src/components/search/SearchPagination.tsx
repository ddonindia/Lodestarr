import { buttonSecondaryStyle } from '../../styles/shared';

interface SearchPaginationProps {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    filteredCount: number;
    onPageChange: (page: number) => void;
}

export default function SearchPagination({
    currentPage,
    totalPages,
    totalResults,
    filteredCount,
    onPageChange
}: SearchPaginationProps) {
    if (totalResults === 0) return null;

    return (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs lg:text-sm opacity-60 px-1">
            <div>Found {totalResults} results</div>
            <div className="flex items-center gap-2 pr-2">
                <span className="text-sm mr-2">
                    Page {currentPage} of {totalPages || 1} ({filteredCount} filtered)
                </span>
                <button
                    id="prev-page-button"
                    data-testid="prev-page-button"
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                    style={buttonSecondaryStyle}
                >
                    Prev
                </button>
                <button
                    id="next-page-button"
                    data-testid="next-page-button"
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed text-sm transition-colors"
                    style={buttonSecondaryStyle}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
