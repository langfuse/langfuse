/** Scroll containers that pin each section header to their top edge. */
export const IO_STICKY_HEADERS_CLASS =
  "[--io-header-h:calc(var(--spacing)*8)] [&_.io-message-header]:bg-surface [&_.io-message-header]:sticky [&_.io-message-header]:top-0 [&_.io-message-header]:z-10";

/** IO sections render flush; the hosting panel owns the horizontal inset. */
export const IO_SECTIONS_FLUSH_CLASS =
  "[&_.io-message-content]:px-0 [&_.io-message-header]:px-0";
