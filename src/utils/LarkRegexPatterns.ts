// Regex patterns for Lark grammar parsing

export const SYMBOL_PREFIX_PATTERN = '^\\s*(?:[?!])?';
export const SYMBOL_SUFFIX_PATTERN = '(?:\\.\\d+)?';
export const TERMINAL_NAME_PATTERN = '([A-Z_][A-Z_0-9]*)';
export const RULE_NAME_PATTERN = '([a-z_][a-z_0-9]*)';

// Template rule patterns
export const PARAMETER_LIST_PATTERN = '(?:\\{(\\s*(?:[a-z_][a-z_0-9]*\\s*(?:,\\s*[a-z_][a-z_0-9]*\\s*)*)?)\\})?';
export const TEMPLATE_RULE_NAME_PATTERN = `([a-z_][a-z_0-9]*)${PARAMETER_LIST_PATTERN}`;

// Compiled regex patterns for performance
export const TERMINAL_DEFINITION_REGEX = new RegExp(`${SYMBOL_PREFIX_PATTERN}${TERMINAL_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\s*:`);
export const RULE_DEFINITION_REGEX = new RegExp(`${SYMBOL_PREFIX_PATTERN}${TEMPLATE_RULE_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\s*:`);

// Template rule parsing regex (captures rule name and parameters separately)
export const TEMPLATE_RULE_DEFINITION_REGEX = new RegExp(`${SYMBOL_PREFIX_PATTERN}${RULE_NAME_PATTERN}\\{(\\s*(?:[a-z_][a-z_0-9]*\\s*(?:,\\s*[a-z_][a-z_0-9]*\\s*)*)?)\\}${SYMBOL_SUFFIX_PATTERN}\\s*:`);

// Import patterns
export const SIMPLE_IMPORT_REGEX = /^\s*%import\s+(\w+(?:\.\w+)*)\.((?:[A-Z_][A-Z_0-9]*)|(?:[a-z_][a-z_0-9]*))(?:\s*->\s*((?:[A-Z_][A-Z_0-9]*)|(?:[a-z_][a-z_0-9]*)))?\s*$/;
export const MULTI_IMPORT_REGEX = /^\s*%import\s+(\w+(?:\.\w+)*)\s*\(\s*([^)]+)\s*\)\s*$/;
export const ALIAS_PATTERN_REGEX = /^\s*([A-Za-z_][A-Za-z_0-9]*)\s*->\s*([A-Za-z_][A-Za-z_0-9]*)\s*$/;

// Usage patterns - now cleanly separated
export const TERMINAL_USAGE_REGEX = new RegExp(`\\b${TERMINAL_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\b`, 'g');
export const RULE_USAGE_REGEX = new RegExp(`\\b${RULE_NAME_PATTERN}${SYMBOL_SUFFIX_PATTERN}\\b`, 'g');
export const TEMPLATE_RULE_USAGE_REGEX = new RegExp(`\\b([a-z_][a-z_0-9]*)\\{([^}]*)\\}`, 'g');

// Utility patterns
export const DEFINITION_HEAD_REGEX = /^\s*([^:\s]+)\s*:/;
export const TERMINAL_NAME_CHECK_REGEX = /^[A-Z_][A-Z_0-9]*$/;

// Helper function to parse parameters from a parameter string
export function parseParameters(parameterString: string): string[] {
    if (!parameterString || parameterString.trim() === '') {
        return [];
    }

    return parameterString
        .split(',')
        .map(param => param.trim())
        .filter(param => param.length > 0);
}
