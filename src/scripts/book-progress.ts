// Where a reader stopped in each book, kept on their own device only.

export interface Progress {
  page: number;
  pages: number;
  /** When it was saved (ms), to list the most recent first */
  at: number;
}

const key = (id: string) => `book:${id}`;

export function readProgress(id: string): Progress | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(key(id)) ?? 'null') as Progress | null;
    // The first page alone is not worth a "continue" prompt.
    return p && p.page > 1 && p.pages > 0 ? p : undefined;
  } catch {
    return undefined;
  }
}

export function saveProgress(id: string, page: number, pages: number) {
  try {
    localStorage.setItem(key(id), JSON.stringify({ page, pages, at: Date.now() } satisfies Progress));
  } catch {
    /* private mode or storage full: reading still works */
  }
}
