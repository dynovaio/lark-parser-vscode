// Regex patterns for Lark grammar parsing

export const SYMBOL_PREFIX_PATTERN = '^\\s*(?:[?!])?';
export const SYMBOL_SUFFIX_PATTERN = '(?:\\.\\d+)?';
export const TERMINAL_NAME_PATTERN = '([A-Z_][A-Z_0-9]*)';
export const RULE_NAME_PATTERN = '([a-z_][a-z_0-9]*)';

// Compiled regex patterns for performance
export const TERMINAL_DEFINITION_REGEX = new RegExp(`${SYMBOL_PREFIX_PATTERN}${TERMINAL_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\s*:`);
export const RULE_DEFINITION_REGEX = new RegExp(`${SYMBOL_PREFIX_PATTERN}${RULE_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\s*:`);

// Import patterns
export const SIMPLE_IMPORT_REGEX = /^\s*%import\s+(\w+(?:\.\w+)*)\.((?:[A-Z_][A-Z_0-9]*)|(?:[a-z_][a-z_0-9]*))(?:\s*->\s*((?:[A-Z_][A-Z_0-9]*)|(?:[a-z_][a-z_0-9]*)))?\s*$/;
export const MULTI_IMPORT_REGEX = /^\s*%import\s+(\w+(?:\.\w+)*)\s*\(\s*([^)]+)\s*\)\s*$/;
export const ALIAS_PATTERN_REGEX = /^\s*([A-Za-z_][A-Za-z_0-9]*)\s*->\s*([A-Za-z_][A-Za-z_0-9]*)\s*$/;

// Usage patterns
export const TERMINAL_USAGE_REGEX = new RegExp(`\\b${TERMINAL_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\b`, 'g');
export const RULE_USAGE_REGEX = new RegExp(`\\b${RULE_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\b`, 'g');

// Utility patterns
export const DEFINITION_HEAD_REGEX = /^\s*([^:\s]+)\s*:/;
export const TERMINAL_NAME_CHECK_REGEX = /^[A-Z_][A-Z_0-9]*$/;
