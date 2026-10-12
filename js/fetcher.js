const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2; // 2 retries = 3 attempts total

/**
 * Fetches CSV text with timeout and retries.
 * @param {string} url 
 * @param {number} [retries=MAX_RETRIES] 
 * @returns {Promise<string>}
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      clearTimeout(timer);
      return text;
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === "AbortError" || controller.signal.aborted;
      lastError = isAbort ? new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`) : err;

      // If we still have retries, wait a short backoff before next attempt
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Fetches and extracts non-empty cells from a subject's CSV sheet.
 * @param {string} subject 
 * @param {string} url 
 * @param {object} [papaInstance] PapaParse instance (defaults to globalThis.Papa)
 * @returns {Promise<{ subject: string, cells: string[], error: string|null }>}
 */
export async function fetchSubject(subject, url, papaInstance) {
  const papa = papaInstance || globalThis.Papa;

  if (!papa) {
    return {
      subject,
      cells: [],
      error: "PapaParse is not available"
    };
  }

  try {
    const csvText = await fetchWithRetry(url);
    const parsed = papa.parse(csvText, {
      skipEmptyLines: false
    });

    if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
      throw new Error(parsed.errors.map((e) => e.message).join("; "));
    }

    const cells = [];
    if (Array.isArray(parsed.data)) {
      for (const row of parsed.data) {
        if (Array.isArray(row)) {
          for (const cell of row) {
            if (typeof cell === "string") {
              const trimmed = cell.trim();
              if (trimmed.length > 0) {
                cells.push(trimmed);
              }
            }
          }
        } else if (typeof row === "string") {
          const trimmed = row.trim();
          if (trimmed.length > 0) {
            cells.push(trimmed);
          }
        }
      }
    }

    return {
      subject,
      cells,
      error: null
    };
  } catch (err) {
    return {
      subject,
      cells: [],
      error: err.message || String(err)
    };
  }
}

/**
 * Fetches all subjects in parallel.
 * One failing subject must never break the others.
 * @param {Record<string, string>} sources 
 * @param {object} [papaInstance]
 * @returns {Promise<Array<{ subject: string, cells: string[], error: string|null }>>}
 */
export async function fetchAllSubjects(sources, papaInstance) {
  const entries = Object.entries(sources);
  const promises = entries.map(([subject, url]) => fetchSubject(subject, url, papaInstance));
  return Promise.all(promises);
}
