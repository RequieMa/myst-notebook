export { extractHashtags, extractTagsFromProp } from './hashtags';
export * from './core';

/** Simple title-case: capitalizes the first letter of each word */
function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 *
 * @param filename
 * @returns title cased heading after removing special characters
 */
export const getHeadingFromFileName = (filename: string): string => {
  return titleCase(filename.replace(/[^\w\s]/gi, ' '));
};
