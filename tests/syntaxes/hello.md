# Lark grammar for a simple text format

```lark
// A bunch of words
start: word+

// Allow optional punctuation after each word
word: WORD ["," | "!"]

// imports WORD from library
%import _common.WORD

// Disregard spaces in text
%ignore " "
```
