# Lark grammar for Semantic Versioning (SemVer)

```lark
// EBNF grammar for Semantic Versioning (SemVer)
// Reference: https://semver.org/spec/v2.0.0.html
// Directly adapted from the SemVer specification at
// https://semver.org/spec/v2.0.0.html#backusnaur-form-grammar-for-valid-semver-versions
// to show compatibility with Lark's EBNF syntax.

?start: valid_semver

valid_semver: version_core
    | version_core "-" pre_release
    | version_core "+" build
    | version_core "-" pre_release "+" build

version_core: major "." minor "." patch

major: numeric_identifier

minor: numeric_identifier

patch: numeric_identifier

pre_release: dot_separated_pre_release_identifiers

dot_separated_pre_release_identifiers: pre_release_identifier
    | pre_release_identifier "." dot_separated_pre_release_identifiers

build: dot_separated_build_identifiers

dot_separated_build_identifiers: build_identifier
    | build_identifier "." dot_separated_build_identifiers

pre_release_identifier: alphanumeric_identifier
    | numeric_identifier

build_identifier: alphanumeric_identifier
    | digits

alphanumeric_identifier: non_digit
    | non_digit identifier_characters
    | identifier_characters non_digit
    | identifier_characters non_digit identifier_characters

numeric_identifier: "0"
    | positive_digit
    | positive_digit digits

identifier_characters: identifier_character
    | identifier_character identifier_characters

identifier_character: digit
    | non_digit

non_digit: letter
    | "-"

digits: digit
    | digit digits

digit: "0"
    | positive_digit

positive_digit: "1".."9"

letter: "A".."Z" | "a".."z"
```
