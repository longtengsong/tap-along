const MAX_INPUT_LENGTH = 1200;
const MIN_ANCHOR_LENGTH = 3;
const MAX_ANCHOR_LENGTH = 40;

/**
 * 从当前念头正文和旧念头片段中提取一段可展示的锚点句。
 * 用最长公共子串做本地匹配，不调用模型；找不到足够的公共片段时返回 undefined。
 */
export const deriveAnchorQuote = (
  currentBody: string,
  relatedSnippet: string,
): string | undefined => {
  if (!currentBody || !relatedSnippet) {
    return undefined;
  }

  const current = currentBody.slice(0, MAX_INPUT_LENGTH).toLowerCase();
  const related = relatedSnippet.slice(0, MAX_INPUT_LENGTH).toLowerCase();

  if (
    current.length < MIN_ANCHOR_LENGTH ||
    related.length < MIN_ANCHOR_LENGTH
  ) {
    return undefined;
  }

  let previous = new Uint16Array(related.length + 1);
  let currentRow = new Uint16Array(related.length + 1);
  let bestLength = 0;
  let bestEnd = 0;

  for (let leftIndex = 1; leftIndex <= current.length; leftIndex += 1) {
    currentRow.fill(0);

    for (let rightIndex = 1; rightIndex <= related.length; rightIndex += 1) {
      if (current[leftIndex - 1] === related[rightIndex - 1]) {
        const length = previous[rightIndex - 1] + 1;
        currentRow[rightIndex] = length;

        if (length > bestLength) {
          bestLength = length;
          bestEnd = leftIndex;
        }
      }
    }

    const swap = previous;
    previous = currentRow;
    currentRow = swap;
  }

  if (bestLength < MIN_ANCHOR_LENGTH) {
    return undefined;
  }

  const quote = currentBody
    .slice(bestEnd - bestLength, bestEnd)
    .replace(/\s+/g, ' ')
    .trim();

  if (!quote || quote.replace(/\s/g, '').length < MIN_ANCHOR_LENGTH) {
    return undefined;
  }

  return quote.slice(0, MAX_ANCHOR_LENGTH).trim();
};
