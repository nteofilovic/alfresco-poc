import { useId } from 'react'
import { PAGE_SIZES } from '../paging'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'


interface Props {
  totalItems: number
  /** Zero-based page index. */
  page: number
  pageSize: number
  /** Selected items that are not on this page; shown so the user knows the selection followed them here. */
  selectedElsewhere?: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

/** Range, rows-per-page and first/previous/next/last controls under the file list. Hidden for a single short page. */
export function Pager({ totalItems, page, pageSize, selectedElsewhere = 0, onPageChange, onPageSizeChange }: Props) {
  const selectId = useId()
  if (totalItems <= PAGE_SIZES[0]) return null

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))
  const current = Math.min(page, pageCount - 1)
  const first = current * pageSize + 1
  const last = Math.min(totalItems, (current + 1) * pageSize)
  const atStart = current === 0
  const atEnd = current >= pageCount - 1

  return (
    <nav className="pager" aria-label="Pagination">
      <p className="pager-range" aria-live="polite" aria-atomic="true">
        {first}–{last} of {totalItems}
      </p>
      {selectedElsewhere > 0 && (
        <p className="pager-selected" aria-live="polite">
          {selectedElsewhere} selected on {selectedElsewhere === 1 ? 'another page' : 'other pages'}
        </p>
      )}

      <div className="pager-size">
        <label htmlFor={selectId}>
          Rows<span className="pager-size-long"> per page</span>
        </label>
        <select id={selectId} value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="pager-nav">
        <button type="button" className="icon-button" aria-label="First page" disabled={atStart} onClick={() => onPageChange(0)}>
          <ChevronsLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Previous page" disabled={atStart} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="pager-page">
          Page {current + 1} of {pageCount}
        </span>
        <button type="button" className="icon-button" aria-label="Next page" disabled={atEnd} onClick={() => onPageChange(current + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <button type="button" className="icon-button" aria-label="Last page" disabled={atEnd} onClick={() => onPageChange(pageCount - 1)}>
          <ChevronsRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
